/**
 * Smoke test for the whole chain, on the real runtime: a prompt goes in, the
 * classifier picks a task type, the scorer picks a fleet member, dispatch
 * resolves it to a llama-swap model id, and that model answers.
 *
 * This is the thing that did not exist before 30 August 2026. The router
 * recorded a decision and nothing consumed it; every turn was pinned to one
 * model. Four prompts below cover all four task types and should land on two
 * different models with no configuration between them.
 *
 *   node .scratch/local-inference-lanes/smoke-dispatch.mjs
 *
 * Requires llama-swap listening on 127.0.0.1:8080.
 */

import { LocalModelProvider } from "../../plugins/dsh-client-ui-base/lib/model-plane/local-provider.js";
import { loadFleet } from "../../plugins/dsh-client-ui-base/lib/registry/loader.js";
import { classifyRequest } from "../../plugins/dsh-client-ui-base/lib/router/classify.js";
import { recordRoutingDecision, runtimeModelForCurrentTurn } from "../../plugins/dsh-client-ui-base/lib/router/dispatch.js";
import { scoreFleet } from "../../plugins/dsh-client-ui-base/lib/router/score.js";

const provider = new LocalModelProvider();
const fleet = loadFleet().loaded;

console.log("fleet that passed the licence gate:");
for (const member of fleet) console.log(`  ${member.name}  ->  ${member.runtime_id}  (${member.role})`);

const PROMPTS = [
	"Read the scanned inspection report and summarise the key findings.",
	"Refactor this Python function and add unit tests for it.",
	"Calculate the wall loss percentage for a nominal 9.5 mm pipe measured at 7.2 mm.",
	"Identify the symbols in this P&ID drawing and list the equipment tags.",
];

for (const prompt of PROMPTS) {
	// Exactly what `classifyAndRoute` does on agent/pre-step, step 1.
	const classification = classifyRequest(prompt);
	const routing = scoreFleet(classification.taskType, fleet);
	recordRoutingDecision(routing, 1);

	// Exactly what the LLM adapter does immediately before calling the provider.
	const dispatch = runtimeModelForCurrentTurn(fleet);

	console.log(`\n"${prompt.slice(0, 58)}..."`);
	console.log(`  task type : ${classification.taskType}${classification.fallback ? " (fallback — no rule matched)" : ""}`);
	console.log(`  selected  : ${routing.selected}`);
	console.log(`  dispatch  : ${dispatch.runtimeId ?? "(none)"}  [${dispatch.reason}]`);
	if (routing.excluded.length > 0) {
		for (const entry of routing.excluded) console.log(`  excluded  : ${entry.name} — ${entry.reason.code}`);
	}

	if (dispatch.runtimeId === null) {
		console.log("  ANSWER    : skipped, nothing to dispatch to");
		continue;
	}

	const started = Date.now();
	let answer = "";
	try {
		for await (const piece of provider.answer({
			model: dispatch.runtimeId,
			maxTokens: 48,
			messages: [{ role: "user", content: [{ type: "text", text: `${prompt} Answer in one short sentence.` }] }],
		})) {
			if (piece.type === "text") answer += piece.text;
		}
	} catch (error) {
		console.log(`  ANSWER    : FAILED — ${error.message}`);
		continue;
	}
	const seconds = ((Date.now() - started) / 1000).toFixed(2);
	console.log(`  answered  : ${seconds}s by ${dispatch.runtimeId}`);
	console.log(`              ${answer.replace(/\s+/g, " ").trim().slice(0, 150)}`);
}

console.log("\nresident at the end (llama-swap holds one at a time):");
for (const model of await provider.running()) console.log(`  ${model.model} = ${model.state}`);
