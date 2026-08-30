/**
 * Which language should the coding lane ask for?
 *
 * Three attempts at a PowerShell one-liner from Qwen2.5-Coder-1.5B produced three
 * different failures: a C-style ternary PowerShell echoed as literals, an `if (`
 * wrapping a statement list (syntax error), and `sum(1..100)` — which is Python.
 * That last one is the clue. Qwen's coder training is heavily Python-weighted, so
 * the cheapest fix may be to stop fighting the model and ask for what it knows.
 *
 * `tool-pwsh` stays the executor either way (dsh-bash-sandbox never loads on
 * win32, per docs/deepseek-harness-notes.md) — the command just becomes
 * `python -c "..."`. Python 3.13 is already on this machine.
 *
 * Runs each language N times and reports how often the sandbox printed a real
 * verdict. Strict: the last line must BE "PASS" or "FAIL", never merely contain it.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalModelProvider } from "../../plugins/dsh-client-ui-base/lib/model-plane/local-provider.js";

const provider = new LocalModelProvider();
const ATTEMPTS = 3;

const schema = {
	type: "object",
	properties: { code: { type: "string" }, description: { type: "string" } },
	required: ["code", "description"],
	additionalProperties: false,
};

const TASKS = [
	{ task: "Sum the integers from 1 to 100.", expected: "5050" },
	{ task: "Count how many integers from 1 to 200 are divisible by both 3 and 5.", expected: "13" },
	{ task: "Compute the wall loss percentage when nominal thickness is 9.5 mm and measured is 7.2 mm, rounded to one decimal place.", expected: "24.2" },
];

const LANGUAGES = {
	powershell: {
		system:
			"You emit only JSON matching the schema. `code` is valid PowerShell 7 on one line.\n" +
			'Shape: $actual = <expr>; $expected = <value>; if ("$actual" -eq "$expected") { "PASS" } else { "FAIL" }\n' +
			"Print only PASS or only FAIL.",
		run(code) {
			return execFileSync("pwsh", ["-NoProfile", "-Command", code], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
		},
	},
	python: {
		system:
			"You emit only JSON matching the schema. `code` is valid Python 3.\n" +
			'Shape: actual = <expr>\\nexpected = <value>\\nprint("PASS" if str(actual) == str(expected) else "FAIL")\n' +
			"Print only PASS or only FAIL.",
		run(code) {
			// Via a file rather than -c, so multi-line code and quoting are not a factor.
			const path = join(tmpdir(), `bf-probe-${Date.now()}.py`);
			writeFileSync(path, code, "utf8");
			try {
				return execFileSync("python", [path], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
			} finally {
				unlinkSync(path);
			}
		},
	},
};

async function ask(system, task, expected) {
	let out = "";
	for await (const piece of provider.answer({
		model: "bf-coder",
		schema,
		schemaName: "sandbox_code",
		maxTokens: 300,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: [{ type: "text", text: `${task} Verify the result against the expected value ${expected} and print PASS or FAIL.` }] },
		],
	})) {
		if (piece.type === "text") out += piece.text;
	}
	return JSON.parse(out);
}

for (const [language, config] of Object.entries(LANGUAGES)) {
	console.log(`\n=== ${language} ===`);
	let passes = 0;
	let total = 0;
	for (const { task, expected } of TASKS) {
		for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
			total += 1;
			let verdict = "(no run)";
			let code = "";
			try {
				const call = await ask(config.system, task, expected);
				code = (call.code ?? "").trim();
				const output = config.run(code);
				verdict = output.trim().split(/\r?\n/).pop()?.trim() ?? "";
				if (verdict === "PASS") passes += 1;
			} catch (error) {
				verdict = `ERROR: ${String(error.message).split("\n")[0].slice(0, 90)}`;
			}
			const mark = verdict === "PASS" ? "PASS" : verdict === "FAIL" ? "fail" : "BROKE";
			console.log(`  [${mark}] ${task.slice(0, 44)}...  -> ${verdict.slice(0, 70)}`);
			if (mark !== "PASS") console.log(`         code: ${code.replace(/\s+/g, " ").slice(0, 130)}`);
		}
	}
	console.log(`  ${language}: ${passes}/${total} produced a real PASS`);
}
