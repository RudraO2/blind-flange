/**
 * Tests for the coding lane (`lanes/code.js`).
 *
 * All pure functions, so none of this needs a model, llama-swap or a GPU. The
 * two things worth being strict about are the shell quoting — which is where a
 * small model's output most easily becomes a broken command or, worse, an
 * injection — and the verdict, which is the whole point of the lane: it must be
 * arithmetic we control, never a substring match on the model's own claim.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
	CODE_LANE_SYSTEM_PROMPT,
	CodeLaneError,
	describeVerdict,
	parseProgram,
	PYTHON_PROGRAM_SCHEMA,
	pythonCommand,
	servesTaskType,
	toPowerShellSingleQuoted,
	verdictFor,
} from "../lib/lanes/code.js";

test("the lane serves the two task types that resolve to the coder, and no others", () => {
	assert.equal(servesTaskType("code"), true);
	// A calculation with steps shown is a program that prints its working, which
	// is what the problem statement asks for.
	assert.equal(servesTaskType("calculation"), true);
	assert.equal(servesTaskType("document"), false);
	assert.equal(servesTaskType("drawing"), false);
	assert.equal(servesTaskType(undefined), false);
});

test("the schema demands the prediction, not just the program", () => {
	// `expected` is the field that makes verification real: the model commits to
	// an answer before the code runs, and our comparison is against that.
	assert.deepEqual(PYTHON_PROGRAM_SCHEMA.required, ["code", "description", "expected"]);
	assert.equal(PYTHON_PROGRAM_SCHEMA.additionalProperties, false);
});

test("the system prompt shows the shape rather than describing it", () => {
	// Describing the requirement did not work: the model wrote invalid PowerShell
	// and then Python-flavoured nonsense. One worked example did work.
	assert.match(CODE_LANE_SYSTEM_PROMPT, /print\(sum\(range\(1, 101\)\)\)/);
	assert.match(CODE_LANE_SYSTEM_PROMPT, /never single quotes/i);
	// The rule that makes last-line comparison sound: working is allowed above,
	// the final line is the bare answer.
	assert.match(CODE_LANE_SYSTEM_PROMPT, /bare answer with no label/);
});

test("PowerShell single-quoting passes double quotes and dollars through untouched", () => {
	// The reason the model is told to use double quotes: PowerShell expands
	// nothing inside single quotes, so `"` and `$` are safe.
	assert.equal(toPowerShellSingleQuoted('print("PASS")'), `'print("PASS")'`);
	assert.equal(toPowerShellSingleQuoted('print(f"{x}$y")'), `'print(f"{x}$y")'`);
});

test("a single quote in the program is doubled, not left to break the command", () => {
	assert.equal(toPowerShellSingleQuoted("print('hi')"), `'print(''hi'')'`);
	// The shape that would end the string early and let the rest be read as
	// further PowerShell — the injection this escaping exists to prevent.
	assert.equal(toPowerShellSingleQuoted("x'; Remove-Item -Recurse C:\\ ;'"), `'x''; Remove-Item -Recurse C:\\ ;'''`);
});

test("pythonCommand keeps the program inline and readable, because the seal has to inspect it", () => {
	const command = pythonCommand("print(sum(range(1, 101)))");
	assert.equal(command, `python -c 'print(sum(range(1, 101)))'`);
	// Inline and plain text on purpose: a file's contents are not in the tool
	// call, and base64 would make every program opaque to the egress seal.
	assert.match(command, /^python -c /);
	assert.doesNotMatch(command, /b64decode|base64/);
});

test("pythonCommand refuses an empty or multi-line program instead of emitting a broken command", () => {
	assert.throws(() => pythonCommand("   "), CodeLaneError);
	// A small model produces newlines when it forgets the one-line instruction,
	// and a newline cannot survive a single shell argument reliably.
	assert.throws(() => pythonCommand("a = 1\nprint(a)"), CodeLaneError);
});

test("parseProgram reads the three fields, and tolerates a fence the schema forbade", () => {
	const program = parseProgram('{"code":"print(1)","description":"one","expected":"1"}');
	assert.deepEqual(program, { code: "print(1)", description: "one", expected: "1" });
	// Losing a turn over a pair of backticks would be a waste.
	const fenced = parseProgram('```json\n{"code":"print(2)","description":"two","expected":"2"}\n```');
	assert.equal(fenced.code, "print(2)");
});

test("parseProgram fails loudly on unusable output rather than guessing", () => {
	assert.throws(() => parseProgram("not json at all"), CodeLaneError);
	assert.throws(() => parseProgram('{"code":"print(1)","description":"one"}'), CodeLaneError);
	assert.throws(() => parseProgram('{"code":1,"description":"one","expected":"1"}'), CodeLaneError);
});

test("the verdict compares the sandbox's value against the model's prediction", () => {
	assert.deepEqual(verdictFor("5050", "5050\n"), { verdict: "AGREES", expected: "5050", actual: "5050" });
	assert.deepEqual(verdictFor("5050", "4950\n"), { verdict: "DISAGREES", expected: "5050", actual: "4950" });
});

test("the verdict reads the last line, so a program may show its working above it", () => {
	// "calculations with steps shown" is a requirement, not a defect — so working
	// is allowed, on the lines before the answer. The contract is that the LAST
	// line is the bare value and nothing else, which is what the system prompt
	// demands. A labelled final line correctly fails, and that is the point:
	// loosening the comparison to find a number inside prose is how a verdict
	// stops being arithmetic and starts being a guess.
	assert.equal(verdictFor("24.2", "nominal 9.5\nmeasured 7.2\n24.2").verdict, "AGREES");
	assert.deepEqual(verdictFor("24.2", "nominal 9.5\nloss 24.2"), { verdict: "DISAGREES", expected: "24.2", actual: "loss 24.2" });
});

test("numbers agree on value rather than on spelling", () => {
	assert.equal(verdictFor("24.2", "24.20").verdict, "AGREES");
	assert.equal(verdictFor("5050", " 5050 ").verdict, "AGREES");
	assert.equal(verdictFor("0.5", "5e-1").verdict, "AGREES");
	// Text is compared exactly: no substring, no fuzz.
	assert.equal(verdictFor("PASS", "PASSED").verdict, "DISAGREES");
});

test("a program that prints nothing is its own outcome, never agreement by omission", () => {
	const result = verdictFor("5050", "");
	assert.equal(result.verdict, "NO-OUTPUT");
	assert.match(describeVerdict(result), /^NO OUTPUT/);
});

test("the labels do not overclaim: agreement is the model against itself, not against truth", () => {
	// Measured on 30 August 2026: asked for a wall loss the model predicted 20.0
	// while its own program computed 24.21, and asked to convert 18.5 barg it
	// predicted 185 while its program printed 183. Both programs were ALSO wrong,
	// so had the two numbers happened to match, a verdict labelled PASS would have
	// asserted something never checked. Ground truth belongs to the evaluation
	// harness, which holds fixtures; this comparison does not have it.
	const agreed = describeVerdict(verdictFor("5050", "5050"));
	assert.match(agreed, /^AGREES/);
	assert.match(agreed, /not against ground truth/);
	assert.doesNotMatch(agreed, /\bPASS\b/);

	const disagreed = describeVerdict(verdictFor("20.0", "24.21"));
	assert.match(disagreed, /^DISAGREES/);
	// Says which number to believe, because that is the useful part.
	assert.match(disagreed, /computed value is the one to trust/);
});

test("the verdict cannot be satisfied by a program that merely mentions the word", () => {
	// The regression this whole design exists for. During bring-up a check of the
	// form `output.includes("PASS")` reported success for a command the shell
	// never evaluated: it printed the literal text below and the substring
	// matched. Comparing against a predicted value cannot be fooled that way.
	const echoed = "5050 -eq 5050 ? PASS : FAIL";
	assert.equal(verdictFor("5050", echoed).verdict, "DISAGREES");
	assert.ok(echoed.includes("PASS"), "the fixture must contain the word, or it is not testing the trap");
});

test("describeVerdict says who decided, so a reader can check it", () => {
	const agreed = describeVerdict(verdictFor("5050", "5050"));
	assert.match(agreed, /predicted "5050"/);
	assert.match(agreed, /sandbox computed "5050"/);
	assert.match(agreed, /Blind Flange compared them/);
	assert.match(describeVerdict(verdictFor("5050", "1")), /predicted "5050" but the sandbox computed "1"/);
});

test("the quoted command actually runs, end to end, through a real shell", () => {
	// The unit tests above assert the escaping's shape. This asserts it works:
	// a program containing both quote characters, run through pwsh exactly as the
	// harness would, must print what it was supposed to print.
	const code = `print("it's fine" if 1 + 1 == 2 else "no")`;
	const command = pythonCommand(code);
	const output = execFileSync("pwsh", ["-NoProfile", "-Command", command], { encoding: "utf8", timeout: 60_000 });
	assert.equal(verdictFor("it's fine", output).verdict, "AGREES");
});
