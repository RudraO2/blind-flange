/**
 * Tests for Story 3.9: registering Faraday's plugin-owned session event
 * types into the harness's persistence read-path vocabulary
 * (`session-events/known-types.js`).
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { OUR_SESSION_EVENT_TYPES, registerKnownSessionEventTypes } from "../lib/session-events/known-types.js";

test("names every plugin-owned event type, so a stored session carrying one still opens", () => {
	// The four egress markers and the two router decisions. A type appended by
	// this plugin and missing from this list makes every session that contains
	// it permanently unopenable, so this assertion is exhaustive on purpose:
	// adding an event type without adding it here should fail here first.
	assert.deepEqual(OUR_SESSION_EVENT_TYPES, [
		"egress/denied",
		"egress/permitted",
		"egress/escaped",
		"egress/seal",
		"router/classified",
		"router/routed",
	]);
});

test("reports a resolver failure to log and does not throw", () => {
	const messages = [];
	assert.doesNotThrow(() => {
		registerKnownSessionEventTypes({
			resolve: () => {
				throw new Error("boom");
			},
			log: (message) => messages.push(message),
		});
	});
	assert.equal(messages.length, 1);
	assert.match(messages[0], /@blind-flange\/dsh-client-ui-base/);
	assert.match(messages[0], /SessionFormatUnsupportedError/);
	assert.match(messages[0], /boom/);
});

test("reports a resolved package with no mutable KNOWN_SESSION_EVENT_TYPES Set, and does not throw", () => {
	const messages = [];
	assert.doesNotThrow(() => {
		registerKnownSessionEventTypes({
			resolve: () => ({ KNOWN_SESSION_EVENT_TYPES: ["not", "a", "set"] }),
			log: (message) => messages.push(message),
		});
	});
	assert.equal(messages.length, 1);
	assert.match(messages[0], /@blind-flange\/dsh-client-ui-base/);
	assert.match(messages[0], /SessionFormatUnsupportedError/);
});

test("adds our three types to a resolved Set and logs nothing", () => {
	const types = new Set(["some/existing-type"]);
	const messages = [];
	registerKnownSessionEventTypes({
		resolve: () => ({ KNOWN_SESSION_EVENT_TYPES: types }),
		log: (message) => messages.push(message),
	});
	assert.deepEqual(messages, []);
	for (const type of OUR_SESSION_EVENT_TYPES) assert.ok(types.has(type), `expected ${type} to be registered`);
	assert.ok(types.has("some/existing-type"), "did not touch what was already there");
});

test("calling it twice does not throw and leaves the Set with our types exactly once", () => {
	const types = new Set();
	const resolve = () => ({ KNOWN_SESSION_EVENT_TYPES: types });
	registerKnownSessionEventTypes({ resolve, log: () => {} });
	registerKnownSessionEventTypes({ resolve, log: () => {} });
	assert.equal(types.size, OUR_SESSION_EVENT_TYPES.length);
});

test("against the real installed harness: reaches @deepseek-ai/dsh-session's actual KNOWN_SESSION_EVENT_TYPES and registers our types on it", (t) => {
	const packageJsonPath = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh-session", "package.json");
	if (!existsSync(packageJsonPath)) {
		t.skip("no @deepseek-ai/dsh-session installed under ~/.dsh/profiles on this machine");
		return;
	}
	const requireFromProfile = createRequire(packageJsonPath);
	const dshSession = requireFromProfile("@deepseek-ai/dsh-session");
	const messages = [];
	registerKnownSessionEventTypes({ log: (message) => messages.push(message) });
	assert.deepEqual(messages, [], "the default resolver should reach the real package without a reported failure");
	for (const type of OUR_SESSION_EVENT_TYPES) {
		assert.ok(
			dshSession.KNOWN_SESSION_EVENT_TYPES.has(type),
			`expected the real, installed KNOWN_SESSION_EVENT_TYPES Set to contain ${type} after registration`,
		);
	}
});
