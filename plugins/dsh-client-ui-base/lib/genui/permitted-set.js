/**
 * The permitted GenUI component set (Story 8.1).
 *
 * Epic 8 adopts `@changfenhuang/dsh-genui` — a third-party plugin that teaches
 * the model a ```dsh-ui fence and renders the fenced JSON inline in the reply.
 * The plugin's own whitelist is 30-odd component types wide: quizzes, forms,
 * media players, mermaid diagrams and WebGL scenes among them. This file is
 * the narrower list Faraday allows, and the check that holds us to it.
 *
 * **Tables, charts and plots only.** The reasoning is the story's own: a
 * component type nobody demos is a component type nobody audited, and every
 * type outside this set either decorates (3D scenes), invents an interaction
 * we never designed (quizzes, forms) or opens a path off the machine
 * (`audio`/`video` play from any browser-reachable http(s) URL). Restraint
 * over decoration — UX-DR2.
 *
 * Two rules ride along with the type list, because both are the same kind of
 * surface-area decision:
 *
 *   - **No `action` anywhere.** `action` is what wires a rendered component
 *     back into the agent: the plugin sends `[genui-action] <name>` as a user
 *     message and the model answers with a fresh fence. That is an inbound
 *     path from a rendered surface into the model, and no demonstrable needs
 *     it. A component without `action` renders as display only — the plugin
 *     disables buttons that carry none, which is exactly the posture we want.
 *   - **No `href` and no `src`.** Every remaining way a fence could name a
 *     URL. The egress seal would deny the call and the monitor would count it,
 *     but a component that tries is a finding against us either way.
 *
 * The check runs over `model-plane/replay-cache.json` in `npm test`
 * (`test/genui.test.js`), which is where our fences actually come from: the
 * Phase 0 cache is authored by hand (ADR-0001's 28 August 2026 amendment), so
 * every fence that can reach the screen is in the repository and can be
 * checked before it gets there rather than filtered as it renders.
 */

/**
 * The component types a Faraday fence may use.
 *
 * `table` carries the key findings; `chart` (bars/line/donut) and `plot` are
 * the two shapes the story's acceptance criteria name beside it. All three
 * take their colours from the host's `--dsw-*` theme tokens — verified by
 * reading the plugin's own stylesheet at the pinned version, where the only
 * hand-written colour literals sit on `button`, `switch`, `avatar` and
 * `video`, none of which is in this set.
 */
export const PERMITTED_GENUI_TYPES = Object.freeze(["table", "chart", "plot"]);

/** Keys that would open an inbound or outbound path out of a rendered component. */
const FORBIDDEN_KEYS = Object.freeze(["action", "href", "src", "resetAction"]);

/** Matches a fenced ```dsh-ui block and captures its body. */
const FENCE_PATTERN = /```dsh-ui\r?\n([\s\S]*?)```/g;

/**
 * Every `dsh-ui` fence body in a block of reply text, in the order they appear.
 * @param {string} text - an assistant message's text.
 * @returns {string[]} the raw JSON bodies, unparsed.
 */
export function extractGenuiFences(text) {
	if (typeof text !== "string") return [];
	return [...text.matchAll(FENCE_PATTERN)].map((match) => match[1]);
}

/**
 * Walk a parsed value and report every way it leaves the permitted set.
 *
 * Returns the reasons rather than throwing, so a test can name all of them at
 * once instead of one per run.
 * @param {unknown} spec - a parsed fence body.
 * @returns {string[]} one message per violation; empty means the fence is allowed.
 */
export function checkGenuiSpec(spec) {
	const violations = [];
	if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
		return ["the fence body is not a JSON object"];
	}
	if (!Array.isArray(spec.items)) return ["the fence body has no `items` array"];

	/**
	 * @param {unknown} value - the node or nested value under inspection.
	 * @param {string} path - where it sits, for the message.
	 */
	const walk = (value, path) => {
		if (Array.isArray(value)) {
			value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
			return;
		}
		if (value === null || typeof value !== "object") return;
		for (const key of Object.keys(value)) {
			if (FORBIDDEN_KEYS.includes(key)) violations.push(`${path} carries \`${key}\``);
		}
		if (typeof value.type === "string" && !PERMITTED_GENUI_TYPES.includes(value.type)) {
			violations.push(`${path} is a \`${value.type}\`, which is outside the permitted set`);
		}
		for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
	};

	spec.items.forEach((node, index) => {
		const path = `items[${index}]`;
		if (node === null || typeof node !== "object" || Array.isArray(node)) {
			violations.push(`${path} is not a component object`);
			return;
		}
		if (typeof node.type !== "string") violations.push(`${path} has no \`type\``);
		walk(node, path);
	});
	return violations;
}
