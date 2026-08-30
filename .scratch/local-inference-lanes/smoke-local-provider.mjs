/**
 * Smoke test: drive the real LocalModelProvider against the real llama-swap.
 *
 * The unit tests cover framing and failure modes against a stub. This proves the
 * whole path once, end to end, on this machine: both fleet members, the schema
 * path that replaces native tool calling, and the residency read.
 *
 *   node .scratch/local-inference-lanes/smoke-local-provider.mjs
 *
 * Requires llama-swap listening on 127.0.0.1:8080.
 */

import { execFileSync } from "node:child_process";
import { LocalModelProvider } from "../../plugins/dsh-client-ui-base/lib/model-plane/local-provider.js";

const provider = new LocalModelProvider();

async function turn(label, request) {
	const started = Date.now();
	let text = "";
	let reasoning = "";
	try {
		for await (const piece of provider.answer(request)) {
			if (piece.type === "text") text += piece.text;
			else if (piece.type === "reasoning") reasoning += piece.text;
		}
	} catch (error) {
		console.log(`\n### ${label}\n    FAILED: ${error.message}`);
		return null;
	}
	const seconds = ((Date.now() - started) / 1000).toFixed(2);
	console.log(`\n### ${label}  (${seconds}s, ${text.length} chars${reasoning ? `, ${reasoning.length} reasoning` : ""})`);
	console.log(`    ${text.replace(/\s+/g, " ").trim().slice(0, 300)}`);
	return text;
}

console.log(`endpoint: ${provider.endpoint}   default model: ${provider.defaultModel}`);

await turn("coder, plain streaming text", {
	model: "bf-coder",
	messages: [{ role: "user", content: [{ type: "text", text: "In one short sentence, what does a blind flange do?" }] }],
	maxTokens: 80,
});

await turn("vision model as a text model — the document lane's common case", {
	model: "bf-vision",
	messages: [
		{
			role: "user",
			content: [
				{
					type: "text",
					text:
						"These lines were read by OCR from a scanned inspection report:\n" +
						"PSV-2207A relief valve, set pressure 18.5 barg, last tested 2024-03-11\n" +
						"E-1104A channel, 3 o'clock position, wall thickness 7.2 mm, minimum 6.4 mm\n" +
						"Support shoe displaced 18 mm at pipe rack bent 14\n\n" +
						"List the equipment tags mentioned, comma separated. Tags only.",
				},
			],
		},
	],
	maxTokens: 60,
});

// The path that replaces native tool calling: constrain the reply to a schema,
// then build the tool call from the validated object ourselves.
const schema = {
	type: "object",
	properties: {
		command: { type: "string", description: "One PowerShell command." },
		description: { type: "string", description: "One line describing it." },
	},
	required: ["command", "description"],
	additionalProperties: false,
};

const json = await turn("coder, schema-constrained — how a tool call gets made", {
	model: "bf-coder",
	schema,
	schemaName: "pwsh_call",
	messages: [
		// A 1.5B needs the shape shown, not described. Without this example it wrote
		// `if ($sum = 0; for (...) {...}; if (...) {...} }` — invalid PowerShell.
		// One worked example is the cheapest correction available and costs ~40 tokens.
		{
			role: "system",
			content:
				"You emit only JSON matching the schema. No prose, no code fences.\n" +
				"The command must be valid PowerShell 7 and must print only PASS or only FAIL.\n" +
				"Follow this shape exactly, changing only the computation and the expected value:\n" +
				'$actual = <computation>; $expected = <value>; if ($actual -eq $expected) { "PASS" } else { "FAIL" }',
		},
		{
			role: "user",
			content: [
				{
					type: "text",
					text:
						"Compute the sum of the integers from 1 to 100. Verify it against the expected value 5050 " +
						"and print PASS or FAIL.",
				},
			],
		},
	],
	maxTokens: 300,
});

if (json) {
	let call;
	try {
		call = JSON.parse(json);
	} catch (error) {
		console.log(`    schema output did not parse: ${error.message}`);
	}
	if (call?.command) {
		console.log(`\n    synthesised tool call -> pwsh(${JSON.stringify(call).slice(0, 160)})`);
		try {
			const out = execFileSync("pwsh", ["-NoProfile", "-Command", call.command], { encoding: "utf8", timeout: 60_000 });
			console.log(`    sandbox output: ${out.trim().replace(/\s+/g, " ")}`);
			// STRICT, and this matters. An earlier version of this check used
			// `out.includes("PASS")` and reported success for a command PowerShell
			// never evaluated: the model wrote a C-style ternary, PowerShell echoed
			// the literal tokens `5050 -eq 5050 ? PASS : FAIL`, and the substring
			// matched. The evaluation harness must require the output to BE the
			// verdict, not to contain it — otherwise a model that merely mentions
			// the word scores a pass and the whole metric is theatre.
			const verdict = out.trim().split(/\r?\n/).pop()?.trim();
			if (verdict === "PASS") console.log("    >>> the model wrote a real assertion and it PASSED");
			else if (verdict === "FAIL") console.log("    >>> assertion ran and correctly reported FAIL");
			else console.log(`    >>> NOT a verdict: ${JSON.stringify(verdict)} — the command did not actually assert anything`);
		} catch (error) {
			console.log(`    sandbox failed: ${error.message.split("\n")[0]}`);
		}
	}
}

console.log("\n### residency, read from llama-swap rather than tracked by us");
for (const model of await provider.running()) {
	console.log(`    ${model.model} = ${model.state} (ttl ${model.ttl})`);
}
