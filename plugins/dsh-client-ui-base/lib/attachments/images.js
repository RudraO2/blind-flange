/**
 * Images the operator attached to a message, resolved into what the vision
 * model reads.
 *
 * **What this replaces.** Until 31 August 2026 an uploaded picture went to a
 * Python OCR service, came back as lines of extracted text, and the vision
 * model was handed the words. The picture itself never appeared in the
 * conversation — the composer's upload control was a session-level side
 * channel, so a judge who attached a photograph saw a status pill saying the
 * document had been read, and the transcript above it stayed empty. ADR-0008
 * removed that path entirely.
 *
 * **What it uses instead.** The harness already ships the whole thing.
 * `@deepseek-ai/dsh-attachment` is a durable attachment seam: it validates and
 * commits an image, then hands back a serializable `ImageAttachmentRef` that
 * rides on the message as an `image` content block.
 * `@deepseek-ai/dsh-client-ui-attachment` renders the composer's draft
 * thumbnail rail, the drag-and-drop target, the chat-history gallery and the
 * lightbox. Both were mounted and working in this profile the whole time —
 * paste an image into the composer and a 64px draft card appears, verified in
 * the running workbench on 31 August 2026.
 *
 * The only broken link was ours. `local-provider.js` flattened every message to
 * a plain string before serialising it, so an `image` block was silently
 * dropped on the floor: the model was never sent the picture the user could
 * plainly see attached to their own message. This module is that link.
 *
 * **Why the image rides its own message rather than the last one.** The
 * previous code attached every image to whichever user message came last, which
 * is right for a single-turn demo and wrong for a conversation: ask a follow-up
 * question and the picture would detach from the message it belonged to and
 * jump forward. Resolving in place keeps a three-turn conversation about two
 * different images coherent, which is how ChatGPT and Gemini behave and what an
 * operator expects.
 */

/**
 * The request-image budget for `bf-vision`.
 *
 * `readImageRequest` projects the stored image down to fit these, so an 8 MP
 * phone photograph does not arrive at a 2B model at full resolution.
 *
 * **Why 640×640 and not more.** Measured on this box, 31 August 2026. The first
 * version of this file allowed one megapixel, on the arithmetic that Qwen3-VL
 * bills about one token per 28×28 patch — roughly 1,340 tokens, comfortable
 * inside the 8192-token context llama-swap gives that model. Sent through the
 * real runtime it was not comfortable at all:
 *
 *     llama-swap returned 400 for "bf-vision": request (8510 tokens) exceeds
 *     the available context size (8192 tokens)
 *
 * The arithmetic was optimistic and, more to the point, it costed the image
 * alone. An image never arrives alone: it rides a conversation that already has
 * turns in it, and the ceiling has to leave room for the rest of the session or
 * it fails on the second question rather than the first. 640×640 is about
 * 410,000 pixels — enough to read a nameplate or a gauge face on a 2B model,
 * and small enough that several turns of conversation still fit around it.
 *
 * Raising the model's own `--ctx-size` is the other half of this trade and is a
 * llama-swap config change, not a change here; it costs KV-cache VRAM on a card
 * that has about 3.7 GB free in total.
 */
export const IMAGE_REQUEST_POLICY = { maxPixels: 640 * 640, maxBytes: 2 * 1024 * 1024 };

/** Whether `block` is a harness `ImageBlock` carrying a durable reference. */
function isImageBlock(block) {
	return block?.type === "image" && block.attachment != null && typeof block.attachment.attachmentId === "string";
}

/**
 * Every durable image reference in `messages`, in the order they appear.
 *
 * Exported for the trace panel and the tests; the resolver below is what the
 * model plane actually calls.
 * @param {Array<{ content?: unknown }>} messages
 * @returns {Array<object>} the `ImageAttachmentRef`s.
 */
export function imageRefsIn(messages) {
	const refs = [];
	for (const message of Array.isArray(messages) ? messages : []) {
		if (!Array.isArray(message?.content)) continue;
		for (const block of message.content) {
			if (isImageBlock(block)) refs.push(block.attachment);
		}
	}
	return refs;
}

/**
 * `messages` with every `image` block's bytes resolved and inlined.
 *
 * Each resolved block gains `mediaType` and `base64` alongside the reference it
 * already carried, which is what `local-provider.js` serialises into an OpenAI
 * `image_url` part. Messages with no image are returned untouched — the same
 * object, not a copy — so the common text-only turn costs nothing.
 *
 * **A failed read drops that one image and keeps the turn.** An attachment can
 * be unreadable (storage removed underneath a resumed session, a transform that
 * cannot encode), and the alternative to dropping it is failing a turn the user
 * has already sent. The warning names the attachment so the cause is findable,
 * and `local-provider.js` tells the model in words that a picture could not be
 * loaded rather than letting it answer as though none was ever attached — a
 * model handed a question about an image it cannot see will invent one.
 *
 * @param {Array<{ content?: unknown }>} messages
 * @param {(ref: object, policy: object) => Promise<{ data: Uint8Array, mediaType: string }>} readImageRequest
 *   the host's `ctx.attachments.readImageRequest`.
 * @returns {Promise<Array<object>>}
 */
export async function resolveMessageImages(messages, readImageRequest) {
	const source = Array.isArray(messages) ? messages : [];
	if (typeof readImageRequest !== "function") return source;

	return await Promise.all(
		source.map(async (message) => {
			if (!Array.isArray(message?.content) || !message.content.some(isImageBlock)) return message;
			const content = await Promise.all(
				message.content.map(async (block) => {
					if (!isImageBlock(block)) return block;
					try {
						const requested = await readImageRequest(block.attachment, IMAGE_REQUEST_POLICY);
						return {
							...block,
							mediaType: requested.mediaType,
							base64: Buffer.from(requested.data).toString("base64"),
						};
					} catch (error) {
						console.warn(
							`@blind-flange/dsh-client-ui-base: attachment ${block.attachment.attachmentId} could not be read — ` +
								`${error instanceof Error ? error.message : String(error)}`,
						);
						return { ...block, unreadable: true };
					}
				}),
			);
			return { ...message, content };
		}),
	);
}
