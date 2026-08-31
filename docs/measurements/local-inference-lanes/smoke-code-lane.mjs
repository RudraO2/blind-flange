/**
 * Smoke test for the coding lane, driven through the real LLM adapter against
 * the real model, with the harness's agent loop simulated around it.
 *
 * The loop the harness runs, and this reproduces:
 *   1. adapter.stream() -> text blocks and a tool-call block
 *   2. the tool call is dispatched for real (here: pwsh, as the harness does)
 *   3. the result is appended as a tool-result message
 *   4. adapter.stream() again -> the verdict, then the model's narration
 *
 * Also the coding lane's first evaluation data: five tasks, pass rate, latency.
 *
 *   node .scratch/local-inference-lanes/smoke-code-lane.mjs
 *
 * Requires llama-swap listening on 127.0.0.1:8080.
 */

import { execFileSync } from "node:child_process";
import { clearPrediction } from "../../plugins/dsh-client-ui-base/lib/lanes/code.js";
import { createLlmAdapter } from "../../plugins/dsh-client-ui-base/lib/model-plane/llm-adapter.js";
import { LocalModelProvider } from "../../plugins/dsh-client-ui-base/lib/model-plane/local-provider.js";
import { loadFleet } from "../../plugins/dsh-client-ui-base/lib/registry/loader.js";
import { classifyRequest } from "../../plugins/dsh-client-ui-base/lib/router/classify.js";
import { recordRoutingDecision } from "../../plugins/dsh-client-ui-base/lib/router/dispatch.js";
import { scoreFleet } from "../../plugins/dsh-client-ui-base/lib/router/score.js";

const adapter = createLlmAdapter(new LocalModelProvider(), { displayName: "Blind Flange (local)" });
const fleet = loadFleet().loaded;

/** Collect one adapter turn into text and tool calls. */
async function turn(messages) {
	let text = "";
	const calls = [];
	for await (const chunk of adapter.stream({ messages })) {
		if (chunk.type === "text-delta") text += chunk.text;
		if (chunk.type === "block-end" && chunk.block?.type === "tool-call") calls.push(chunk.block);
	}
	return { text, calls };
}

/** A tool-result message in the shape the harness appends. */
function toolResult(call, output) {
	return {
		role: "user",
		source: { kind: "tool" },
		content: [{ type: "tool-result", toolCallId: call.id, content: [{ type: "text", text: output }] }],
	};
}

const TASKS = [
	"Sum the integers from 1 to 100.",
	"Count how many integers from 1 to 200 are divisible by both 3 and 5.",
	"A pipe has a nominal wall thickness of 9.5 mm and measures 7.2 mm. Compute the wall loss as a percentage, rounded to one decimal place.",
	"A relief valve is set at 18.5 barg. Express that set pressure in kPa gauge, rounded to the nearest whole number.",
	"Given readings 7.2, 7.6, 6.9 and 7.4 mm, report the minimum reading.",
];

let passes = 0;
let sandboxRuns = 0;
let misrouted = 0;
const latencies = [];

for (const task of TASKS) {
	clearPrediction();
	console.log(`\n${"=".repeat(78)}\n${task}`);

	// What classifyAndRoute does on agent/pre-step, step 1.
	const classification = classifyRequest(task);
	recordRoutingDecision(scoreFleet(classification.taskType, fleet), 1);
	console.log(`  routed as ${classification.taskType}`);

	const started = Date.now();
	const messages = [{ role: "user", content: [{ type: "text", text: task }] }];

	const first = await turn(messages);
	console.log(`  step 1: ${first.text.replace(/\s+/g, " ").trim().slice(0, 130)}`);

	if (first.calls.length === 0) {
		misrouted += 1;
		console.log(
			`  NO SANDBOX CALL — classified \`${classification.taskType}\`, so the coding lane never engaged` +
				" and the model answered from memory instead of computing",
		);
		continue;
	}
	const call = first.calls[0];
	const args = JSON.parse(call.arguments);
	console.log(`  tool call: ${call.name}  ${args.command}`);

	// The harness dispatches this for real. So do we.
	let output;
	try {
		output = execFileSync("pwsh", ["-NoProfile", "-Command", args.command], { encoding: "utf8", timeout: 60_000 });
		sandboxRuns += 1;
	} catch (error) {
		output = `error: ${String(error.stderr ?? error.message).split("\n")[0]}`;
	}
	console.log(`  sandbox : ${output.trim().replace(/\s+/g, " ").slice(0, 90)}`);

	const second = await turn([...messages, { role: "assistant", content: [{ type: "text", text: first.text }] }, toolResult(call, output)]);
	const seconds = (Date.now() - started) / 1000;
	latencies.push(seconds);

	const verdictLine = second.text.split("\n")[0];
	console.log(`  verdict : ${verdictLine.slice(0, 170)}`);
	console.log(`  total   : ${seconds.toFixed(2)}s`);
	if (verdictLine.startsWith("AGREES")) passes += 1;
}

const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
console.log(`\n${"=".repeat(78)}`);
console.log(`coding lane: ${sandboxRuns}/${TASKS.length} reached the sandbox, ${misrouted}/${TASKS.length} never got there`);
console.log(`of those that ran, ${passes} agreed with the model's own prediction`);
console.log(`mean end-to-end latency, sandboxed turns only: ${mean.toFixed(2)}s`);
console.log("");
console.log("AGREES means the model's prediction matched its own program's output. It is a");
console.log("self-consistency check, NOT a correctness claim — pass rates against ground truth");
console.log("are the evaluation harness's job, because it holds the fixtures.");
if (misrouted > 0) {
	console.log("");
	console.log(`FOR THE ROUTER'S OWNER: ${misrouted} task(s) above classified as something other than`);
	console.log("`code` or `calculation`, so the coding lane never engaged and the model answered");
	console.log("arithmetic from memory instead of computing it. classify.js has no rules for plain");
	console.log("arithmetic word problems. This branch does not touch that file — it is yours.");
}
