/**
 * `npm run evaluate` — how right are the two lanes, and how long do they take?
 *
 * The problem statement asks for a working demonstration. A demonstration that
 * cannot be scored is an anecdote, so this is the number behind it: ten fixtures,
 * five per lane, each with a **ground truth written down by a human**, run through
 * the real path against the real models, graded by comparing values.
 *
 * ## Why the grading works the way it does
 *
 * Three temptations were rejected, each because it measures something other than
 * what it appears to.
 *
 * **Not "did the output contain PASS".** During bring-up a check of that form
 * reported success for a command the shell never evaluated — it printed the
 * literal text `5050 -eq 5050 ? PASS : FAIL` and the substring matched. A metric
 * that greps for a verdict word can be satisfied by a program that never ran.
 *
 * **Not "did the model's prediction match its own program".** That is a
 * self-consistency check, and the coding lane shows it live because it is useful
 * when it fails. It is not correctness: asked for a wall loss the model predicted
 * 20.0 while its program computed 24.21, and both were wrong. Had they agreed, a
 * consistency check would have called it a pass.
 *
 * **Not a model judging a model.** That is a second inference pass on a card with
 * no room for one, and it replaces a measurement with an opinion.
 *
 * So: the model computes or extracts, and this script compares the result against
 * a value a human wrote down. That comparison is arithmetic, and it is the only
 * thing here that decides a pass.
 *
 * ## What it needs running
 *
 * llama-swap on 127.0.0.1:8080 for both lanes, and the ingestion service on
 * 127.0.0.1:8642 for the document lane. Neither is started here: a benchmark that
 * boots its own dependencies hides how long they took.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "dsh-client-ui-base", "lib");

const { clearDocument } = await import(`file://${join(PLUGIN, "findings", "attached.js")}`);
const { ingestionHealth } = await import(`file://${join(PLUGIN, "findings", "ingestion-client.js")}`);
const { createReportFindingsTool } = await import(`file://${join(PLUGIN, "findings", "tool.js")}`);
const { CODE_LANE_SYSTEM_PROMPT, PYTHON_PROGRAM_SCHEMA, parseProgram, pythonCommand, verdictFor } = await import(
	`file://${join(PLUGIN, "lanes", "code.js")}`
);
const { LocalModelProvider } = await import(`file://${join(PLUGIN, "model-plane", "local-provider.js")}`);
const { loadFleet } = await import(`file://${join(PLUGIN, "registry", "loader.js")}`);
const { classifyRequest } = await import(`file://${join(PLUGIN, "router", "classify.js")}`);
const { resolveRuntimeModel } = await import(`file://${join(PLUGIN, "router", "dispatch.js")}`);
const { scoreFleet } = await import(`file://${join(PLUGIN, "router", "score.js")}`);

const provider = new LocalModelProvider();
const fleet = loadFleet().loaded;

/**
 * The coding lane's fixtures. `expected` is ground truth, written by hand and
 * checked against the source report where the numbers come from it — not a value
 * the model produced and not a value this script derived.
 *
 * Deliberately arithmetic an engineer would actually ask for, and deliberately
 * including two the model got wrong from memory during bring-up (the wall loss and
 * the pressure conversion), because a fixture set that only contains what already
 * works measures nothing.
 */
const CODE_FIXTURES = [
	{ task: "Sum the integers from 1 to 100.", expected: "5050" },
	{ task: "Count how many integers from 1 to 200 are divisible by both 3 and 5.", expected: "13" },
	{
		task: "A pipe has a nominal wall thickness of 9.5 mm and measures 7.2 mm. Compute the wall loss as a percentage of nominal, rounded to one decimal place.",
		expected: "24.2",
	},
	{ task: "Convert a set pressure of 18.5 barg to kPa gauge, rounded to the nearest whole number.", expected: "1850" },
	{
		task: "Given ultrasonic readings 11.42, 11.08, 12.91 and 13.05 mm, report the smallest reading.",
		expected: "11.08",
	},
];

/**
 * The document lane's fixtures, every answer read out of
 * `services/ingestion/fixtures/sample-inspection-report.pdf` by a human.
 *
 * These are the fields an approval note is actually built from — the reference
 * number, the tags carrying major findings, a thickness reading against its
 * minimum — rather than trivia the OCR happens to find easy.
 */
const DOCUMENT_FIXTURES = [
	{ question: "What is the report number?", expected: "NRC/RVF/INSP/2026-0417" },
	{ question: "How many findings are graded Major?", expected: "2" },
	{ question: "What is the measured thickness at CML 04, in millimetres?", expected: "13.05" },
	{ question: "Which equipment tag has an expired test tag?", expected: "PSV-2207A" },
	{ question: "What is the minimum allowable thickness at CML 06, in millimetres?", expected: "6.90" },
];

/** The single-value answer shape the document lane is held to, so grading is a comparison. */
const ANSWER_SCHEMA = {
	type: "object",
	properties: {
		answer: { type: "string", description: "The value only. No units, no label, no sentence." },
		// Capped, because an uncapped citation is how this schema got truncated: asked
		// how many findings were Major the model began quoting every line it had read
		// and ran out of tokens mid-string, so a correct answer was graded as no answer.
		// The cap is on the field a model over-fills, not on the reply as a whole.
		citation: { type: "string", maxLength: 200, description: "One short line from the report this was read from." },
	},
	required: ["answer", "citation"],
	additionalProperties: false,
};

/** Drain a provider stream into text. */
async function ask(request) {
	let text = "";
	for await (const piece of provider.answer(request)) {
		if (piece.type === "text") text += piece.text;
	}
	return text;
}

/** Which model the router sends a prompt to, resolved exactly as the adapter does. */
function routeFor(prompt) {
	const taskType = classifyRequest(prompt).taskType;
	const dispatch = resolveRuntimeModel(scoreFleet(taskType, fleet).selected, fleet);
	return { taskType, ...dispatch };
}

async function runCodeFixture({ task, expected }) {
	const started = Date.now();
	// Routed for the record, then forced to the coding lane. The router's own
	// accuracy is measured separately below: mixing the two would let a
	// classification miss look like a lane failure.
	const route = routeFor(task);
	const forced = resolveRuntimeModel(scoreFleet("code", fleet).selected, fleet);

	let program;
	try {
		program = parseProgram(
			await ask({
				model: forced.runtimeId,
				schema: PYTHON_PROGRAM_SCHEMA,
				schemaName: "bf_python_program",
				maxTokens: 700,
				messages: [{ role: "system", content: CODE_LANE_SYSTEM_PROMPT }, { role: "user", content: task }],
			}),
		);
	} catch (error) {
		return { verdict: "FAIL", detail: `no usable program: ${error.message}`, seconds: (Date.now() - started) / 1000, route };
	}

	let output;
	try {
		output = execFileSync("pwsh", ["-NoProfile", "-Command", pythonCommand(program.code)], {
			encoding: "utf8",
			timeout: 60_000,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		return {
			verdict: "FAIL",
			detail: `the program did not run: ${String(error.message).split("\n")[0].slice(0, 90)}`,
			seconds: (Date.now() - started) / 1000,
			route,
			code: program.code,
		};
	}

	// Ground truth, not the model's prediction. `verdictFor` compares the last
	// printed line, numerically when both sides are numbers.
	const result = verdictFor(expected, output);
	return {
		verdict: result.verdict === "AGREES" ? "PASS" : "FAIL",
		detail: result.verdict === "AGREES" ? `computed ${result.actual}` : `expected ${expected}, computed ${result.actual || "nothing"}`,
		seconds: (Date.now() - started) / 1000,
		route,
		code: program.code,
		// Reported alongside, never as the grade: whether the model's own guess
		// matched what its program computed.
		selfConsistent: verdictFor(program.expected, output).verdict === "AGREES",
	};
}

async function runDocumentFixture({ question, expected }, findings) {
	const started = Date.now();
	const route = routeFor(question);
	const forced = resolveRuntimeModel(scoreFleet("document", fleet).selected, fleet);

	// OCR text, not the page image: the document lane feeds the vision member
	// lines rather than pixels, which is why it pays no vision-encoder cost.
	const lines = findings.map((finding) => `p${finding.page}: ${finding.text}`).join("\n");

	let answer;
	try {
		const reply = await ask({
			model: forced.runtimeId,
			schema: ANSWER_SCHEMA,
			schemaName: "bf_report_answer",
			// 300 was not enough: a truncated schema reply is a harness defect that
			// reads as a model failure, and it cost a correct answer in the first run.
			maxTokens: 700,
			messages: [
				{
					role: "system",
					content:
						"You answer only from the OCR lines given. You return only JSON matching the schema. " +
						"`answer` is the value alone — no units, no label, no sentence.",
				},
				{ role: "user", content: `OCR lines from the inspection report:\n${lines}\n\n${question}` },
			],
		});
		answer = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
	} catch (error) {
		return { verdict: "FAIL", detail: `no usable answer: ${error.message.slice(0, 80)}`, seconds: (Date.now() - started) / 1000, route };
	}

	const result = verdictFor(expected, String(answer?.answer ?? ""));
	return {
		verdict: result.verdict === "AGREES" ? "PASS" : "FAIL",
		detail: result.verdict === "AGREES" ? `read ${result.actual}` : `expected ${expected}, read ${result.actual || "nothing"}`,
		seconds: (Date.now() - started) / 1000,
		route,
		// A citation is the difference between an answer and a claim, so whether
		// one was given is reported even though it is not graded.
		cited: typeof answer?.citation === "string" && answer.citation.trim() !== "",
	};
}

/**
 * The program column is the explainability half of this report, not decoration.
 *
 * A row reading "expected 24.2, computed 24.210526315789473" looks like broken
 * arithmetic until you can see `print((9.5 - 7.2) / 9.5 * 100)` beside it — at
 * which point it is obviously the right formula ignoring the requested rounding.
 * Those are different defects and a reader should not have to guess which they are
 * looking at. So the failing program is shown verbatim, and the verdict stays FAIL
 * because the task asked for one decimal place and did not get it.
 */
function table(rows, firstColumn, { showCode = false } = {}) {
	const header = showCode
		? `| ${firstColumn} | expected | result | verdict | seconds | what the model wrote |`
		: `| ${firstColumn} | expected | result | verdict | seconds | routed as |`;
	const lines = [header, showCode ? "| --- | --- | --- | --- | --: | --- |" : "| --- | --- | --- | --- | --: | --- |"];
	for (const row of rows) {
		const last = showCode
			? row.code
				? `\`${row.code.replace(/\|/g, "\\|").slice(0, 130)}\``
				: "—"
			: `${row.route.taskType}${row.route.runtimeId ? ` → ${row.route.runtimeId}` : ""}`;
		lines.push(`| ${row.label} | \`${row.expected}\` | ${row.detail} | **${row.verdict}** | ${row.seconds.toFixed(2)} | ${last} |`);
	}
	return lines.join("\n");
}

async function main() {
	console.log("fleet:");
	for (const member of fleet) console.log(`  ${member.name} -> ${member.runtime_id}`);

	// Fail loudly and early rather than reporting ten failures that all mean "the
	// runtime was not running".
	try {
		await ask({ model: fleet[0]?.runtime_id, maxTokens: 4, messages: [{ role: "user", content: "ok" }] });
	} catch (error) {
		console.error(`\nllama-swap is not answering: ${error.message}`);
		return 1;
	}
	const health = await ingestionHealth();
	if (!health.up) {
		console.error(`\nthe ingestion service is not answering: ${health.detail ?? "unknown"} — start it with \`npm run ingestion\``);
		return 1;
	}
	console.log(`ingestion: warm=${health.warm} renderDpi=${health.renderDpi}\n`);

	clearDocument();
	const ingestion = await createReportFindingsTool().execute({});
	console.log(`read ${ingestion.findings.length} OCR lines from ${ingestion.report} (${ingestion.source})\n`);

	const codeRows = [];
	for (const fixture of CODE_FIXTURES) {
		const result = await runCodeFixture(fixture);
		codeRows.push({ label: fixture.task.slice(0, 62), expected: fixture.expected, ...result });
		console.log(`[${result.verdict}] code: ${fixture.task.slice(0, 58)} — ${result.detail} (${result.seconds.toFixed(2)}s)`);
		if (result.code) console.log(`        ${result.code.slice(0, 110)}`);
	}

	const documentRows = [];
	for (const fixture of DOCUMENT_FIXTURES) {
		const result = await runDocumentFixture(fixture, ingestion.findings);
		documentRows.push({ label: fixture.question, expected: fixture.expected, ...result });
		console.log(`[${result.verdict}] document: ${fixture.question.slice(0, 52)} — ${result.detail} (${result.seconds.toFixed(2)}s)`);
	}

	const all = [...codeRows, ...documentRows];
	const passed = all.filter((row) => row.verdict === "PASS").length;
	const mean = all.reduce((total, row) => total + row.seconds, 0) / all.length;

	// The router is scored separately. A classification miss is a different defect
	// from a lane getting the answer wrong, and averaging them hides both.
	const routerHits = [
		...codeRows.filter((row) => row.route.taskType === "code" || row.route.taskType === "calculation"),
		...documentRows.filter((row) => row.route.taskType === "document" || row.route.taskType === "drawing"),
	].length;
	const selfConsistent = codeRows.filter((row) => row.selfConsistent).length;
	const cited = documentRows.filter((row) => row.cited).length;

	const report = [
		"# Evaluation",
		"",
		// Local date, not `toISOString()`, which is UTC and reported the previous day
		// when this was first run at 05:00 IST — a small thing that would have made
		// the report look staler than it was.
		`Generated by \`npm run evaluate\` on ${new Date().toLocaleDateString("en-CA")}, on a GTX 1650 Ti with 4 GB of VRAM.`,
		"",
		"Every verdict below is a comparison against a ground-truth value written down by a human — not a",
		"substring match on the output, not the model checking itself, and not a model judging a model. The",
		"model computes or extracts; this harness compares.",
		"",
		`## Coding lane — ${codeRows.filter((r) => r.verdict === "PASS").length}/${codeRows.length}`,
		"",
		"The model writes one line of Python, the sandbox runs it, and the value it printed is compared",
		"against the fixture's expected value. The program is shown so a failure can be read: a wrong",
		"formula and a right formula that ignored the requested rounding are different defects, and both",
		"score FAIL.",
		"",
		table(codeRows, "task", { showCode: true }),
		"",
		`Self-consistency, reported and **not** graded: the model's own prediction matched its program's`,
		`output in ${selfConsistent}/${codeRows.length} cases. Where it did not, the computed value is the one to trust.`,
		"",
		`## Document lane — ${documentRows.filter((r) => r.verdict === "PASS").length}/${documentRows.length}`,
		"",
		"OCR runs on the CPU over the scanned report, and the model answers from the extracted lines rather",
		"than from the page image — which is why this lane pays no vision-encoder cost.",
		"",
		table(documentRows, "question"),
		"",
		`A source line was cited in ${cited}/${documentRows.length} answers. Reported, not graded.`,
		"",
		"## Summary",
		"",
		`| measure | value |`,
		`| --- | --- |`,
		`| answers correct against ground truth | **${passed}/${all.length}** |`,
		`| task type classified into the right lane | ${routerHits}/${all.length} |`,
		`| mean end-to-end latency | ${mean.toFixed(2)}s |`,
		`| slowest fixture | ${Math.max(...all.map((r) => r.seconds)).toFixed(2)}s |`,
		"",
		"The router is scored separately on purpose. A classification miss and a lane getting the answer",
		"wrong are different defects, and one number covering both would hide each of them.",
		"",
	].join("\n");

	const out = join(REPO, "docs", "evaluation.md");
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, report, "utf8");

	console.log(`\n${passed}/${all.length} correct against ground truth · router ${routerHits}/${all.length} · mean ${mean.toFixed(2)}s`);
	console.log(`written to ${out}`);
	return 0;
}

process.exitCode = await main();
