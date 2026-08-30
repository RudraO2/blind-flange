/**
 * Which "user"-role messages are actually the human, and which are the harness
 * talking to itself.
 *
 * The harness folds several things into the message list as `role: "user"`,
 * each tagged with a `source.kind`: a runtime-context snapshot (`plugin`), the
 * catalogue of installed skills (`skill-catalog`), a tool result (`tool`), and
 * auxiliary calls this same adapter serves such as session-title generation
 * (`dsh-session-title-llm`). Verified against a real session log on
 * 28 August 2026: **they land AFTER the human's own message**, so anything that
 * scans backwards for "the last user message" finds one of them instead.
 *
 * `replay-provider.js` has known this since Story 5.1 — its own header records
 * the bug ("the scripted entry never matched because the last user text was a
 * skill catalog"). The knowledge stayed in that one file. When the local
 * provider and the router's `lastUserText` were written they each walked the
 * same list without the same guard, so the fix is centralised here rather than
 * written a third time.
 *
 * A message with no `source` at all counts as human: that is the shape every
 * existing unit test uses, and the harness omits it for a plain typed turn.
 */

/** Source kinds the harness injects that are not the operator speaking. */
export const INJECTED_SOURCE_KINDS = new Set(["plugin", "skill-catalog", "tool", "dsh-session-title-llm"]);

/**
 * Whether `message` is the operator's own turn.
 * @param {{ role?: string, source?: { kind?: string } }} message
 */
export function isGenuineHumanMessage(message) {
	if (!message || message.role !== "user") return false;
	return message.source === undefined || message.source.kind === "user";
}

/**
 * The most recent thing the operator actually typed.
 *
 * Falls back to the last user-role message of any kind when no genuine one is
 * present, because an empty string would classify as the fallback task type and
 * silently route a real request to the wrong lane — a wrong answer from the
 * right text beats a confident answer from none.
 * @param {Array<{ role?: string, source?: { kind?: string } }>} messages
 */
export function lastGenuineUserMessage(messages) {
	if (!Array.isArray(messages)) return undefined;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isGenuineHumanMessage(messages[i])) return messages[i];
	}
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]?.role === "user") return messages[i];
	}
	return undefined;
}

/**
 * Drop everything the harness injects as a "user" message that the operator
 * never typed.
 *
 * Two kinds, and both had to go. The skill catalogue (`skill-catalog`) came
 * first: Blind Flange disables every skill row it can, so a catalogue is
 * describing capabilities this workbench does not offer, and on 30 August 2026
 * "summarise the findings in the inspection report" came back as a summary of
 * the skill list.
 *
 * The runtime-context snapshot (`plugin`, from `@deepseek-ai/dsh-system-prompt`)
 * was kept in that first pass, on the reasoning that a model needs to know its
 * working directory and file policy to use tools well. That was the wrong call
 * and the same session proved it an hour later: asked "what is in the doc I
 * sent?" with nothing attached, the model summarised the file policy and the
 * approval policy and presented it as the contents of the document. Removing
 * one source of unrequested text and leaving the other just moved the failure.
 *
 * Blind Flange can afford to drop it where a general agent could not. Its lanes
 * do not browse a filesystem: the coding lane is constrained to a JSON schema
 * and runs one command, and the document lane is fed OCR text. Neither reasons
 * about the workspace path.
 *
 * Tool results (`tool`) are NOT dropped — the model must see what its own tool
 * calls returned or it cannot finish a turn.
 * @param {Array<{ role?: string, source?: { kind?: string } }>} messages
 */
export function withoutHarnessInjections(messages) {
	if (!Array.isArray(messages)) return [];
	return messages.filter((message) => {
		const kind = message?.source?.kind;
		return kind !== "skill-catalog" && kind !== "plugin";
	});
}
