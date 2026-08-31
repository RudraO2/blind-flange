import assert from "node:assert/strict";
import test from "node:test";

import {
	alreadyDispatched,
	clearDispatch,
	describePlan,
	describeProgress,
	describeReports,
	FanoutLaneError,
	helpersHaveReported,
	MAX_HELPERS,
	helpersDispatched,
	isSettleTurn,
	parsePlan,
	rememberDispatch,
	settledReports,
	requestedHelperCount,
	subagentArguments,
	SUBAGENT_TOOL_NAME,
	userText,
	wantsDelegation,
} from "../lib/lanes/fanout.js";

/** A message in the shape the harness gives a plain typed turn: no `source`. */
const human = (text) => ({ role: "user", content: [{ type: "text", text }] });

test("wantsDelegation reads the operator's own words", async (t) => {
	await t.test("fires on the phrasings an operator actually types", () => {
		for (const text of [
			"Use a helper agent to work out the heat loss from 40 m of steam line.",
			"Use three helper agents, one each, to check these pumps.",
			"Use two helper agents: one writes the function, the other writes tests.",
			"Delegate this to two helpers.",
			"Spawn a sub-agent to double-check the corrosion finding.",
			"I need three corrosion rate calculations. Split this up.",
			"Fan out the work across three agents.",
		]) {
			assert.equal(wantsDelegation([human(text)]), true, text);
		}
	});

	await t.test("does not fire on a question about delegation", () => {
		// The distinction the lane turns on: mentioning a helper agent is not
		// asking for one, and spawning a session in answer to "what is X?" would
		// be the same over-eagerness this lane exists to replace.
		for (const text of [
			"What is a helper agent?",
			"Can this workbench spawn sub-agents at all?",
			"Explain how helper agents differ from a single model.",
		]) {
			assert.equal(wantsDelegation([human(text)]), false, text);
		}
	});

	await t.test("reads past the messages the harness injects after the human's", () => {
		// The bug `injected.js` was written for: a naive scan backwards for the
		// last `role: "user"` message finds a skill catalogue, not the operator.
		const messages = [
			human("Use two helper agents to check these two pumps."),
			{ role: "user", source: { kind: "skill-catalog" }, content: [{ type: "text", text: "ai-seo, hyperframes, media-use" }] },
		];
		assert.equal(wantsDelegation(messages), true);
		assert.match(userText(messages), /two helper agents/);
	});
});

test("requestedHelperCount reads a count only when the operator gave one", () => {
	assert.equal(requestedHelperCount("Use three helper agents, one each."), 3);
	assert.equal(requestedHelperCount("Use two helper agents."), 2);
	assert.equal(requestedHelperCount("Use a helper agent to check it."), 1);
	assert.equal(requestedHelperCount("Use 4 helper agents."), 4);
	assert.equal(requestedHelperCount("Delegate this work."), null);
});

test("parsePlan turns a schema-constrained reply into helpers", async (t) => {
	const valid = JSON.stringify({
		helpers: [
			{ description: "Check P-101A duty point", prompt: "A pump P-101A is specified for 250 m3/h. Assess it." },
			{ description: "Check P-102B duty point", prompt: "A pump P-102B is specified for 80 m3/h. Assess it." },
		],
	});

	await t.test("parses the plain case", () => {
		const helpers = parsePlan(valid);
		assert.equal(helpers.length, 2);
		assert.equal(helpers[0].description, "Check P-101A duty point");
		assert.match(helpers[1].prompt, /80 m3\/h/);
	});

	await t.test("tolerates a code fence the schema forbade", () => {
		assert.equal(parsePlan("```json\n" + valid + "\n```").length, 2);
	});

	await t.test("trims an over-long plan rather than refusing it", () => {
		const many = JSON.stringify({
			helpers: Array.from({ length: MAX_HELPERS + 3 }, (_, i) => ({
				description: `Job ${i}`,
				prompt: `Do job ${i}.`,
			})),
		});
		assert.equal(parsePlan(many).length, MAX_HELPERS);
	});

	await t.test("skips a helper with no instruction", () => {
		const withEmpty = JSON.stringify({
			helpers: [
				{ description: "Real job", prompt: "Do the real job." },
				{ description: "Empty job", prompt: "   " },
			],
		});
		const helpers = parsePlan(withEmpty);
		assert.equal(helpers.length, 1);
		assert.equal(helpers[0].description, "Real job");
	});

	await t.test("names a helper the model left unlabelled", () => {
		const unlabelled = JSON.stringify({ helpers: [{ description: "", prompt: "Do the job." }] });
		assert.equal(parsePlan(unlabelled)[0].description, "Helper agent");
	});

	await t.test("refuses what it cannot use", () => {
		assert.throws(() => parsePlan("I'll spin up two helpers for you!"), FanoutLaneError);
		assert.throws(() => parsePlan(JSON.stringify({ agents: [] })), FanoutLaneError);
		assert.throws(() => parsePlan(JSON.stringify({ helpers: [{ description: "x", prompt: "" }] })), FanoutLaneError);
	});
});

test("subagentArguments carries exactly the two arguments the tool takes", () => {
	const args = JSON.parse(subagentArguments({ description: "Check P-101A", prompt: "Assess the duty point." }));
	assert.deepEqual(args, { description: "Check P-101A", prompt: "Assess the duty point." });
	// `run_in_background` is the preset's decision, in `continuable` mode. A
	// second opinion from here would override a deployment choice.
	assert.equal("run_in_background" in args, false);
});

test("describePlan states the count and the queueing", async (t) => {
	await t.test("names every helper", () => {
		const text = describePlan([{ description: "Check P-101A" }, { description: "Check P-102B" }]);
		assert.match(text, /Delegating to 2 helper agents/);
		assert.match(text, /- Check P-101A/);
		assert.match(text, /- Check P-102B/);
	});

	await t.test("warns that helpers run in turn, but only when there are several", () => {
		// The honest line about `--parallel 1`. A single helper does not queue
		// behind anything, so saying so would be noise.
		assert.match(describePlan([{ description: "a" }, { description: "b" }]), /run in turn/);
		assert.doesNotMatch(describePlan([{ description: "a" }]), /run in turn/);
		assert.match(describePlan([{ description: "a" }]), /Delegating to 1 helper agent:/);
	});
});

test("helpersHaveReported is true once anything has been dispatched for this request", async (t) => {
	const toolResult = {
		role: "user",
		source: { kind: "tool" },
		content: [{ type: "tool-result", content: [{ type: "text", text: "running in the background" }] }],
	};

	await t.test("false before dispatch, true after", () => {
		assert.equal(helpersHaveReported([human("Use two helper agents.")]), false);
		assert.equal(helpersHaveReported([human("Use two helper agents."), toolResult]), true);
	});

	await t.test("stays true when the harness appends a message AFTER the tool result", () => {
		// The runaway of 31 August 2026. Looking only at the last message read
		// "not dispatched yet" every time something landed behind the result, so
		// the lane planned again — one parent session reached thirty children.
		const messages = [
			human("Use two helper agents."),
			toolResult,
			{ role: "user", source: { kind: "skill-catalog" }, content: [{ type: "text", text: "catalogue" }] },
			{ role: "assistant", content: [{ type: "text", text: "thinking" }] },
		];
		assert.equal(helpersHaveReported(messages), true);
	});

	await t.test("counts a result from any one of several calls", () => {
		const messages = [human("Use three helper agents."), toolResult, toolResult, toolResult];
		assert.equal(helpersHaveReported(messages), true);
	});

	await t.test("a tool result BEFORE the operator's message does not count", () => {
		// A previous turn's dispatch must not suppress this turn's.
		assert.equal(helpersHaveReported([toolResult, human("Use two helper agents.")]), false);
	});

	await t.test("refuses to plan against a history with no genuine trigger", () => {
		assert.equal(helpersHaveReported([]), true);
		assert.equal(helpersHaveReported([{ role: "assistant", content: [] }]), true);
	});
});

test("a helper is never told to delegate", async (t) => {
	// The recursion defence, moved here on 31 August 2026 after the
	// `source.kind` heuristic it replaced turned out to suppress real operator
	// turns and disable the lane outright.
	await t.test("drops a helper whose own prompt asks for helpers", () => {
		const plan = JSON.stringify({
			helpers: [
				{ description: "Check P-101A", prompt: "Assess whether 250 m3/h is a reasonable duty point for P-101A." },
				{ description: "Check the rest", prompt: "Use two helper agents to check P-102B and P-103C." },
			],
		});
		const helpers = parsePlan(plan);
		assert.equal(helpers.length, 1);
		assert.equal(helpers[0].description, "Check P-101A");
	});

	await t.test("a plan of nothing but delegation is refused outright", () => {
		const plan = JSON.stringify({
			helpers: [{ description: "Delegate onward", prompt: "Spawn a sub-agent to do the real work." }],
		});
		assert.throws(() => parsePlan(plan), FanoutLaneError);
	});

	await t.test("an ordinary instruction that merely says 'agent' still passes", () => {
		// The pattern needs a delegation verb near the noun. Describing an agent
		// is not asking for one, and over-refusing here would drop good helpers.
		const plan = JSON.stringify({
			helpers: [{ description: "Explain", prompt: "Explain what an inspection agent records during a shutdown." }],
		});
		assert.equal(parsePlan(plan).length, 1);
	});
});

test("the tool name matches the preset's own `toolName` config", () => {
	// profile/agent-presets/*/agent.cordis.yml mounts `tool-subagent` with
	// `toolName: subagent`. If that row is renamed, this test is the thing that
	// notices before a demo does.
	assert.equal(SUBAGENT_TOOL_NAME, "subagent");
});

test("the dispatch guard refuses a second fan-out for the same request", async (t) => {
	t.afterEach(() => clearDispatch());

	await t.test("remembers the request it dispatched for", () => {
		const trigger = "Use three helper agents to check these pumps.";
		assert.equal(alreadyDispatched(trigger), false);
		rememberDispatch(trigger);
		assert.equal(alreadyDispatched(trigger), true);
	});

	await t.test("a different request still dispatches", () => {
		rememberDispatch("Use three helper agents to check these pumps.");
		assert.equal(alreadyDispatched("Use two helper agents to check the vessels."), false);
	});

	await t.test("ignores surrounding whitespace, which the composer can add", () => {
		rememberDispatch("  Use two helper agents.  ");
		assert.equal(alreadyDispatched("Use two helper agents."), true);
	});

	await t.test("an empty trigger never counts as dispatched", () => {
		// Otherwise a turn we could not read the operator's words from would
		// suppress the next one for no reason.
		rememberDispatch("");
		assert.equal(alreadyDispatched(""), false);
	});

	await t.test("clearDispatch allows a deliberate re-run", () => {
		rememberDispatch("Use two helper agents.");
		clearDispatch();
		assert.equal(alreadyDispatched("Use two helper agents."), false);
	});
});

test("the parent holds until every helper is in", async (t) => {
	t.afterEach(() => clearDispatch());

	// The shape a finished background helper sends its parent, read from a real
	// session log on 31 August 2026.
	const settled = (closing, sender) => ({
		role: "user",
		source: { kind: "subagent-settled", form: "notice", senderSessionId: sender },
		content: [
			{ type: "text", text: `Background subagent ${sender} finished and will do no further work unless you send it more.` },
			{ type: "text", text: "Its closing message:" },
			{ type: "text", text: closing },
		],
	});

	await t.test("recognises a helper reporting back", () => {
		assert.equal(isSettleTurn([human("Use two helper agents."), settled("P-101A is fine.", "a")]), true);
		assert.equal(isSettleTurn([human("Use two helper agents.")]), false);
	});

	await t.test("reads each helper's closing message, not the harness's notice around it", () => {
		const messages = [
			human("Use two helper agents."),
			settled("P-101A: the duty point is reasonable.", "a"),
			settled("P-102B: the head looks high for that flow.", "b"),
		];
		const reports = settledReports(messages);
		assert.deepEqual(reports, ["P-101A: the duty point is reasonable.", "P-102B: the head looks high for that flow."]);
		// The harness's own wrapper must not survive into the summary.
		for (const report of reports) assert.doesNotMatch(report, /will do no further work/);
	});

	await t.test("a previous request's helpers are not counted as this one's", () => {
		const messages = [
			settled("An older helper.", "old"),
			human("Use two helper agents."),
			settled("P-101A: fine.", "a"),
		];
		assert.deepEqual(settledReports(messages), ["P-101A: fine."]);
	});

	await t.test("remembers how many went out", () => {
		rememberDispatch("Use three helper agents.", 3);
		assert.equal(helpersDispatched(), 3);
		clearDispatch();
		assert.equal(helpersDispatched(), 0);
	});

	await t.test("the progress line names the count, not the content", () => {
		assert.equal(describeProgress(1, 3), "Helper 1 of 3 has reported. Waiting for the rest.");
	});

	await t.test("the consolidated block carries every report verbatim", () => {
		const text = describeReports(["P-101A: fine.", "P-102B: head is high.", "P-103C: fine."]);
		assert.match(text, /All 3 helpers have reported/);
		assert.match(text, /P-101A: fine\./);
		assert.match(text, /P-102B: head is high\./);
		assert.match(text, /P-103C: fine\./);
		assert.match(text, /\*\*Helper 3\*\*/);
	});

	await t.test("one helper is not called 'helpers'", () => {
		assert.match(describeReports(["only one"]), /^The helper has reported\./);
	});
});
