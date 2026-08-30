/**
 * The coding lane: how a request classified `code` or `calculation` becomes a
 * program that runs in the sandbox and a verdict somebody can check.
 *
 * ## Python, not PowerShell
 *
 * Measured on 30 August 2026 over nine attempts per language
 * (`.scratch/local-inference-lanes/issues/08`): `Qwen2.5-Coder-1.5B-Instruct`
 * produced runnable PowerShell **zero** times and runnable Python **six**
 * times. It gave the reason away by writing `sum(1..100)` when asked for
 * PowerShell — its training is Python-weighted. `tool-pwsh` is still the
 * executor, because `dsh-bash-sandbox` never loads on win32; the command
 * invokes the interpreter.
 *
 * ## The model predicts, the sandbox computes, our code compares
 *
 * A 1.5B asked to both compute *and* format a verdict got the formatting wrong
 * a third of the time on answers that were correct. Worse, a check of the form
 * "did the output contain PASS" reported success during bring-up for a program
 * the shell never evaluated — it printed the literal text
 * `5050 -eq 5050 ? PASS : FAIL` and the substring matched. **A metric that
 * greps for a verdict word is theatre.**
 *
 * So the model is asked for three things: the program, a one-line description,
 * and the value it **expects** the program to print. It commits to an answer
 * before the code runs. The sandbox then produces the real value and
 * {@link verdictFor} compares the two. Disagreement is a visible result rather
 * than a hidden one, and the comparison is arithmetic we control rather than a
 * claim the model makes about itself.
 *
 * ## Why the program must stay readable in the command
 *
 * `tools/pre-execute` decides from the call's static shape, so the egress seal
 * can only inspect a program it can see. That rules out the obvious way to dodge
 * shell quoting — base64-encoding the source and `exec`-ing it — because that
 * would make every program opaque to the seal and silently reopen the hole
 * `NETWORK_PYTHON_PATTERN` exists to close. The code goes in as readable text,
 * and the quoting is handled by {@link toPowerShellSingleQuoted}.
 */

/** Task types this lane serves. `calculation` is here because a calculation with steps shown is a program that prints its working. */
export const CODE_LANE_TASK_TYPES = new Set(["code", "calculation"]);

/** The tool the program is executed through — the harness's own Windows shell executor. */
export const SANDBOX_TOOL_NAME = "pwsh";

/**
 * What the model must return. Constrained by the server's sampling rather than
 * requested politely, which is what makes a 1.5B reliable here — see
 * `local-provider.js` on why this replaced native tool calling.
 */
export const PYTHON_PROGRAM_SCHEMA = {
	type: "object",
	properties: {
		code: {
			type: "string",
			description:
				"A single line of Python 3 whose LAST printed line is the bare answer, with no label or units. " +
				"Use double quotes for strings, never single quotes.",
		},
		description: { type: "string", description: "One line describing what the program computes." },
		expected: { type: "string", description: "Exactly the final value you expect the program to print." },
	},
	required: ["code", "description", "expected"],
	additionalProperties: false,
};

/** A name for the schema, so a server-side rejection says which one failed. */
export const PYTHON_PROGRAM_SCHEMA_NAME = "bf_python_program";

/**
 * Shown the shape rather than told about it. Without a worked example the model
 * wrote `if ($sum = 0; for (...) {...}; ...)` for PowerShell and `sum(1..100)`
 * for Python — describing the requirement did not work, demonstrating it did.
 * One line, because a multi-line program cannot be passed through a shell
 * argument without quoting that a small model gets wrong.
 */
export const CODE_LANE_SYSTEM_PROMPT = [
	"You return only JSON matching the schema. No prose, no code fences.",
	"`code` is ONE line of Python 3. Use double quotes for strings, never single quotes. Never use input().",
	"Separate statements with semicolons. Use a conditional expression rather than a block if.",
	"You may print intermediate working on earlier lines, but the LAST thing printed must be",
	"the bare answer with no label, no units and no surrounding words.",
	"`expected` is exactly that final value, as a string.",
	"",
	// Each of these three exists because the model got it wrong in a measured run
	// (`npm run evaluate`, 30 August 2026), and each is a general reading rule
	// rather than an answer. Nothing here tells it a conversion factor or a
	// formula — that would be teaching to the fixtures instead of to the task.
	"Read the task exactly before writing anything:",
	"- If it says count, count the items. If it says sum, add them. These are different.",
	"- Get the direction of a difference right: loss or reduction from a nominal value is",
	"  nominal minus measured, and a loss is reported as a positive number.",
	"- If the task asks for rounding or a number of decimal places, apply it in the code.",
	"",
	"Example, for the task 'sum the integers from 1 to 100':",
	'{"code": "print(sum(range(1, 101)))", "description": "Sums the integers from 1 to 100.", "expected": "5050"}',
].join("\n");

/**
 * Quote text as a PowerShell single-quoted string.
 *
 * PowerShell does no expansion inside single quotes, so a Python program full of
 * `"` and `$` passes through untouched — which is why the model is told to use
 * double quotes. The one character needing care is the single quote itself,
 * which PowerShell escapes by doubling.
 * @param {string} text
 */
export function toPowerShellSingleQuoted(text) {
	return `'${String(text).replaceAll("'", "''")}'`;
}

/** Thrown when the model's schema-constrained reply cannot be used. */
export class CodeLaneError extends Error {
	constructor(message) {
		super(message);
		this.name = "CodeLaneError";
	}
}

/**
 * The sandbox command that runs `code`.
 *
 * `-c` and not a file: a file's contents are not in the tool call, so the egress
 * seal could not inspect them before execution — see
 * `UNINSPECTABLE_PYTHON_PATTERN` in `index.js`, which denies exactly that shape.
 * Keeping the program inline is what lets the seal do its job.
 * @param {string} code
 */
export function pythonCommand(code) {
	const program = String(code).trim();
	if (program === "") throw new CodeLaneError("the model returned an empty program");
	if (/[\r\n]/.test(program)) {
		// A newline cannot survive a single shell argument reliably, and a small
		// model produces them when it forgets the one-line instruction.
		throw new CodeLaneError("the model returned a multi-line program; the coding lane runs one line through `python -c`");
	}
	return `python -c ${toPowerShellSingleQuoted(program)}`;
}

/**
 * Parse the model's schema-constrained reply.
 *
 * Tolerant of a fenced block even though the schema forbids one, because a
 * model that ignores the instruction is a normal event and losing the turn over
 * a pair of backticks would be a waste.
 * @param {string} text
 * @returns {{ code: string, description: string, expected: string }}
 */
export function parseProgram(text) {
	const trimmed = String(text ?? "").trim();
	const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
	let parsed;
	try {
		parsed = JSON.parse(unfenced);
	} catch (error) {
		throw new CodeLaneError(`the model's reply was not JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	for (const field of ["code", "description", "expected"]) {
		if (typeof parsed?.[field] !== "string") {
			throw new CodeLaneError(`the model's reply is missing a string "${field}"`);
		}
	}
	return { code: parsed.code, description: parsed.description, expected: parsed.expected };
}

/**
 * Compare an expected value against what the sandbox printed.
 *
 * Compares the **last non-empty line**, because a program that prints working
 * before its answer is desirable rather than a failure — the problem statement
 * asks for calculations with steps shown — and the system prompt requires that
 * final line to be the bare value.
 *
 * Numeric values are compared as numbers when both sides parse as such, so
 * `24.2` and `24.20` agree; everything else is compared as trimmed text.
 * Deliberately not a substring or a fuzzy match: the whole point is that this is
 * arithmetic we control rather than a claim the model makes about itself.
 *
 * **`AGREES` is not a correctness claim, and the naming is deliberate.** Two
 * different questions get asked with this one function:
 *
 *   - *Interactively*, `expected` is the value the model predicted before
 *     running. Agreement means the model's guess matched its own program — a
 *     self-consistency check, and useful precisely when it fails. Measured on
 *     30 August 2026: asked for a wall loss the model predicted 20.0 while its
 *     program computed 24.21, and asked to convert 18.5 barg it predicted 185
 *     while its program printed 183. Both programs were *also* wrong, so had the
 *     two numbers matched, a verdict labelled `PASS` would have been asserting
 *     something it never checked. That is the theatre this module exists to
 *     avoid, so the label says what it means.
 *   - *In the evaluation harness*, `expected` is a fixture's ground truth, and
 *     agreement really is a pass. That mapping belongs to the harness, which
 *     knows it holds ground truth; this function does not.
 * @param {string} expected - a predicted value, or a fixture's ground truth.
 * @param {string} output   - everything the sandbox printed.
 * @returns {{ verdict: "AGREES" | "DISAGREES" | "NO-OUTPUT" | "FAILED", expected: string, actual: string, detail?: string }}
 */
export function verdictFor(expected, output) {
	const raw = String(output ?? "");
	const want0 = String(expected ?? "").trim();

	// A program that crashed has no computed value, so there is nothing to
	// compare, and calling the mismatch a disagreement misleads in the reader's
	// favour: on 30 August 2026 a NameError produced "the model predicted 55 but
	// the sandbox computed [exit code: 1] - the computed value is the one to
	// trust", which told the operator to trust a stack trace. `tool-pwsh` reports
	// the status as a trailing `[exit code: N]` line; a non-zero N is its own
	// verdict, not a wrong answer.
	// `tool-pwsh` frames its output with [stderr] / [stdout] / [exit code: N]
	// markers. They are framing, not printed values, so neither the crash check
	// below nor the last-line rule may mistake one for what the program computed.
	const noise = /^\[(stderr|stdout|exit code)/;
	const exit = raw.match(/\[exit code:\s*(-?\d+)\]/);
	if (exit && exit[1] !== "0") {
		const said = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line !== "" && !noise.test(line));
		return { verdict: "FAILED", expected: want0, actual: "", detail: said.at(-1) ?? `exit code ${exit[1]}` };
	}

	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "" && !noise.test(line));
	const actual = lines.at(-1) ?? "";
	const want = want0;
	if (actual === "") return { verdict: "NO-OUTPUT", expected: want, actual };

	const asNumbers = [want, actual].map(Number);
	const bothNumeric = asNumbers.every((value) => Number.isFinite(value)) && want !== "" && actual !== "";
	const agrees = bothNumeric ? asNumbers[0] === asNumbers[1] : actual === want;
	return { verdict: agrees ? "AGREES" : "DISAGREES", expected: want, actual };
}

/**
 * One line stating the verdict, for the execution trace and the deliverable.
 *
 * Says who decided. "The sandbox printed X, the model predicted Y" is checkable
 * by a reader; "PASS" on its own is a claim.
 * @param {{ verdict: string, expected: string, actual: string }} result
 */
export function describeVerdict(result) {
	if (result.verdict === "FAILED") {
		return (
			`FAILED — the program did not run to completion (${result.detail ?? "non-zero exit"}), so nothing was computed ` +
			`and the model's prediction of ${JSON.stringify(result.expected)} was never checked. The error is the result.`
		);
	}
	if (result.verdict === "NO-OUTPUT") {
		return `NO OUTPUT — the program printed nothing, so there was no computed value to compare against the model's prediction of ${JSON.stringify(result.expected)}.`;
	}
	if (result.verdict === "AGREES") {
		return (
			`AGREES — the model predicted ${JSON.stringify(result.expected)} before the program ran, the sandbox computed ` +
			`${JSON.stringify(result.actual)}, and Faraday compared them. This checks the model against itself, not against ground truth.`
		);
	}
	return (
		`DISAGREES — the model predicted ${JSON.stringify(result.expected)} but the sandbox computed ${JSON.stringify(result.actual)}. ` +
		"The computed value is the one to trust: it was produced by running code, not by the model recalling an answer."
	);
}

/**
 * Whether this lane should handle a turn.
 * @param {string | undefined} taskType - from the router's decision.
 */
export function servesTaskType(taskType) {
	return typeof taskType === "string" && CODE_LANE_TASK_TYPES.has(taskType);
}

/**
 * Whether the sandbox has already run and reported back within this turn.
 *
 * The lane has two steps: ask for a program, then explain what running it
 * produced. Told apart by whether the most recent message is a tool result,
 * which the harness appends after dispatching our call.
 *
 * ponytail: looks at the last message only, so it assumes one tool call per
 * turn — which is what this lane emits. A turn that grew to several calls would
 * need the "count tool results since the last genuine human message" walk that
 * `replay-provider.js` does, and the message-shape subtleties documented there
 * (the harness injects its own `role: "user"` messages after the human's).
 * @param {Array<{ role?: string, source?: { kind?: string }, content?: unknown }>} messages
 */
export function sandboxHasReported(messages) {
	const last = Array.isArray(messages) ? messages.at(-1) : undefined;
	if (last?.role !== "user" || last?.source?.kind !== "tool") return false;
	return Array.isArray(last.content) && last.content.some((block) => block?.type === "tool-result");
}

/**
 * The text the sandbox printed, out of the tool-result message the harness
 * appended. Returns "" when there is nothing readable, which
 * {@link verdictFor} reports as `NO-OUTPUT` rather than as a pass.
 * @param {Array<{ content?: unknown }>} messages
 */
export function sandboxOutput(messages) {
	const last = Array.isArray(messages) ? messages.at(-1) : undefined;
	if (!Array.isArray(last?.content)) return "";
	const parts = [];
	for (const block of last.content) {
		if (block?.type !== "tool-result" || !Array.isArray(block.content)) continue;
		for (const inner of block.content) {
			if (inner?.type === "text" && typeof inner.text === "string") parts.push(inner.text);
		}
	}
	return parts.join("\n");
}

/**
 * The prediction the model committed to for the turn in flight.
 *
 * Held here because it is produced on step one and needed on step two, and the
 * only thing carried between the two is the message history — which contains the
 * program but not the prediction, since the prediction never went to the
 * sandbox. Keeping it out of the program is the point: a value the model stated
 * before running is evidence, one it could revise afterwards is not.
 *
 * ponytail: one prediction for the whole process, the same ceiling and the same
 * upgrade path as `router/dispatch.js` — Phase 0 is single-session by the cut
 * line, and the fix is a map keyed by session id once the adapter has one.
 * @type {{ expected: string, code: string, description: string } | null}
 */
let pending = null;

/** Remember the model's prediction for this turn. */
export function rememberPrediction(program) {
	pending = { expected: program.expected, code: program.code, description: program.description };
}

/** The prediction for the turn in flight, or null when there is none. */
export function pendingPrediction() {
	return pending;
}

/** Forget it. For tests, and after a turn closes. */
export function clearPrediction() {
	pending = null;
}

