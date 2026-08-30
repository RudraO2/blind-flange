/**
 * The audit trail that travels inside the deliverable.
 *
 * The live surfaces already explain a turn while you are looking at them: the
 * routing chip carries every classifier score, the egress monitor carries the
 * counted zero. None of that survives the file leaving the room. A judge who
 * takes the `.docx` away — or an MRPL reviewer opening it six months later — has
 * a document that asserts findings and cannot show where they came from or what
 * produced them.
 *
 * So the reasoning goes in the document. Not a summary of it: the task type and
 * the score that chose the model, the model that actually answered, whether the
 * OCR ran live or came from the committed capture, and what each stage cost. Per
 * clause, the page and region were already there (FR12); this is the part above
 * the clauses that says how the whole thing was produced.
 *
 * **It is assembled from the same state the panels read**, not from a parallel
 * record kept for the document's benefit. A second source of truth for "which
 * model answered" is a second thing to be wrong, and the one in the file is the
 * one nobody can check against the screen once the file has been emailed.
 *
 * Every line is written so it can be *disagreed with*. "Read from the committed
 * capture rather than a live OCR pass" invites someone to ask why; "provenance:
 * verified" invites nothing.
 */

/**
 * @typedef {object} AuditTrail
 * @property {string[]} lines - ready to print, in order. Never empty.
 * @property {boolean} complete - false when something could not be determined, so the document can say so rather than omitting it.
 */

/** A score line for one fleet member, in the form the routing chip shows. */
function memberLine(entry, selected) {
	const matched = Array.isArray(entry.matched) ? entry.matched.map((hit) => `${hit.capability} +${hit.points}`).join(", ") : "";
	const mark = entry.name === selected ? "selected" : "considered";
	return `    ${entry.name} — score ${entry.score} (${matched || "no weighted capability matched"}) [${mark}]`;
}

/**
 * Build the audit trail for a deliverable.
 *
 * Every argument is optional, because a deliverable produced by a path that did
 * not record one of them is still a deliverable — it just says so. An absent fact
 * is printed as an absence rather than dropped, which is the difference between a
 * document that is honest about what it knows and one that looks complete.
 * @param {object} [context]
 * @param {import("../router/score.js").RoutingDecision | null} [context.routing] - the router's own decision.
 * @param {{ runtimeId: string | null, member: string | null, reason: string }} [context.dispatch] - which model it reached.
 * @param {string} [context.providerName] - `replay`, `local` or `remote`.
 * @param {{ report?: string, source?: string, seconds?: number, findings?: number, detail?: string }} [context.ingestion]
 * @param {Array<{ name: string, seconds?: number, outcome?: string }>} [context.tools] - tools run, in order.
 * @param {number} [context.egressDenied] - outbound attempts refused this session.
 * @returns {AuditTrail}
 */
export function buildAuditTrail(context = {}) {
	const lines = [];
	let complete = true;

	// 1. Which lane, and on whose evidence.
	const routing = context.routing ?? null;
	if (routing === null) {
		lines.push("Task type: not recorded for this deliverable.");
		complete = false;
	} else {
		lines.push(`Task type: ${routing.taskType}${routing.fallback === true ? " (no classifier rule matched; this is the fallback)" : ""}`);
		if (Array.isArray(routing.scored) && routing.scored.length > 0) {
			lines.push("Model selection, by score against the licence-checked fleet:");
			for (const entry of routing.scored) lines.push(memberLine(entry, routing.selected));
		}
		// An exclusion is the most interesting line in the block: it is the router
		// declining a model for a stated reason rather than merely preferring another.
		if (Array.isArray(routing.excluded) && routing.excluded.length > 0) {
			for (const entry of routing.excluded) lines.push(`    ${entry.name} — excluded: ${entry.reason?.detail ?? entry.reason?.code}`);
		}
		if (routing.tied === true) lines.push("    Top score was shared; fleet declaration order broke the tie.");
		if (routing.allZero === true) lines.push("    No member scored above zero; the first eligible member was used.");
	}

	// 2. Which model actually answered, which is not the same question.
	const dispatch = context.dispatch ?? null;
	const provider = context.providerName ?? "unknown";
	if (dispatch === null || dispatch.runtimeId === null) {
		lines.push(
			`Answered by: the ${provider} provider's default model` +
				(dispatch?.reason ? ` — the router's choice was not dispatched (${dispatch.reason})` : "") +
				".",
		);
		if (dispatch === null) complete = false;
	} else {
		lines.push(`Answered by: ${dispatch.member}, running locally as "${dispatch.runtimeId}" through the ${provider} provider.`);
	}
	if (provider === "replay") {
		// The disclosure ADR-0001 requires, in the artefact rather than only on screen.
		lines.push("Disclosure: this reply was served from a stored response, not generated by a model on this machine.");
	}

	// 3. Where the text came from.
	const ingestion = context.ingestion ?? null;
	if (ingestion === null) {
		lines.push("Source text: not recorded for this deliverable.");
		complete = false;
	} else if (ingestion.source === "live") {
		lines.push(
			`Source text: ${ingestion.findings ?? "?"} OCR lines read from ${ingestion.report ?? "the ingested document"} on this machine` +
				`${typeof ingestion.seconds === "number" ? ` in ${ingestion.seconds.toFixed(1)}s` : ""}.`,
		);
	} else {
		lines.push(
			`Source text: ${ingestion.findings ?? "?"} OCR lines read from the committed capture of ` +
				`${ingestion.report ?? "the sample report"}, not a live OCR pass${ingestion.detail ? ` — ${ingestion.detail}` : ""}.`,
		);
	}

	// 4. What it did, in order. A list of tools is the closest thing to a
	// narrative of the work that can be checked rather than believed.
	const tools = Array.isArray(context.tools) ? context.tools : [];
	if (tools.length === 0) {
		lines.push("Tools run: none recorded.");
	} else {
		lines.push("Tools run, in order:");
		for (const [index, tool] of tools.entries()) {
			lines.push(
				`    ${index + 1}. ${tool.name}` +
					`${tool.outcome ? ` — ${tool.outcome}` : ""}` +
					`${typeof tool.seconds === "number" ? ` (${tool.seconds.toFixed(1)}s)` : ""}`,
			);
		}
	}

	// 5. The sovereignty claim, as a number rather than a sentence.
	if (typeof context.egressDenied === "number") {
		lines.push(
			context.egressDenied === 0
				? "Outbound network attempts during this session: 0, counted rather than asserted."
				: `Outbound network attempts during this session: ${context.egressDenied}, every one refused and recorded in the audit log.`,
		);
	}

	if (!complete) {
		lines.push("");
		lines.push("Some facts above could not be determined. They are printed as unrecorded rather than omitted.");
	}

	return { lines, complete };
}
