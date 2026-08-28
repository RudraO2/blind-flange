/**
 * Tests for the base plugin's host half: the favicon route and the index.html
 * title/favicon swap (Story 1.5), both reached through `ctx.webServer`'s own
 * extension points (`register`, `tapIndex`) rather than any harness file
 * edit, plus the egress denial waterfall (Story 2.1) registered on
 * `tools/pre-execute`.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { apply, inject } from "../lib/index.js";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * A stub host context that records what got registered on `webServer` and
 * captures the `tools/pre-execute` listener, mirroring the real host's
 * shape closely enough for these tests.
 */
function stubHostCtx() {
	const routes = [];
	const taps = [];
	let preExecuteListener;
	return {
		routes,
		taps,
		get preExecuteListener() {
			return preExecuteListener;
		},
		ctx: {
			effect: (run) => run(),
			on: (name, fn) => {
				if (name === "tools/pre-execute") preExecuteListener = fn;
			},
			webServer: {
				register: (route) => {
					routes.push(route);
					return () => {};
				},
				tapIndex: (transform) => {
					taps.push(transform);
					return () => {};
				},
			},
		},
	};
}

/** Run every recorded tap over `html`, in registration order — mirrors `WebServer.renderIndex`. */
function renderThroughTaps(taps, html) {
	return taps.reduce((out, transform) => transform(out), html);
}

test("declares the webServer service so the host supplies ctx.webServer to apply", () => {
	assert.deepEqual(inject, ["webServer"]);
});

test("registers an exact favicon route serving our svg, not the harness's", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	assert.ok(favicon, "no route registered at /blind-flange/favicon.svg");
	assert.equal(favicon.kind, "exact");

	const ourSvg = readFileSync(join(packageDir, "lib", "favicon.svg"), "utf8");
	let written;
	let headed;
	const res = {
		writeHead: (status, headers) => {
			headed = { status, headers };
		},
		end: (body) => {
			written = body;
		},
	};
	favicon.handler({ method: "GET" }, res);
	assert.equal(headed.status, 200);
	assert.equal(headed.headers["content-type"], "image/svg+xml");
	assert.equal(written.toString("utf8"), ourSvg);
});

test("rejects a non-GET/HEAD request to the favicon route", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	let status;
	favicon.handler({ method: "POST" }, { writeHead: (code) => (status = code), end: () => {} });
	assert.equal(status, 405);
});

test("a HEAD request to the favicon route gets 200 and no body", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	let headed;
	let written;
	favicon.handler(
		{ method: "HEAD" },
		{
			writeHead: (status, headers) => {
				headed = { status, headers };
			},
			end: (body) => {
				written = body;
			},
		},
	);
	assert.equal(headed.status, 200);
	assert.equal(written, undefined);
});

test("taps index.html to swap the shipped title and favicon link for ours", () => {
	const { ctx, taps } = stubHostCtx();
	apply(ctx);
	const shipped = '<head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><title>DeepSeek Harness</title></head>';
	const rendered = renderThroughTaps(taps, shipped);
	assert.ok(rendered.includes("<title>Blind Flange</title>"), "title was not swapped");
	assert.ok(!rendered.includes("DeepSeek Harness"), "the DeepSeek Harness title text is still present");
	assert.ok(rendered.includes('href="/blind-flange/favicon.svg"'), "favicon href was not swapped");
});

test("warns instead of silently doing nothing when the shipped title string isn't found", () => {
	const { ctx, taps } = stubHostCtx();
	apply(ctx);
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		const drifted = '<head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><title>Some Future Title</title></head>';
		const rendered = renderThroughTaps(taps, drifted);
		assert.ok(rendered.includes("Some Future Title"), "html should pass through unchanged when the search string is missing");
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /tab title/);
	} finally {
		console.warn = originalWarn;
	}
});

test("denies web_search before the tool body would run", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const next = () => {
		throw new Error("next() must not be called for a denied tool");
	};
	const decision = await host.preExecuteListener(
		{ name: "web_search", arguments: '{"queries":["MRPL sovereign AI"]}' },
		next,
	);
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /web_search/);
	assert.match(decision.reason, /MRPL sovereign AI/);
});

test("denies web_fetch and names the URL it tried to reach", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener(
		{ name: "web_fetch", arguments: '{"url":"https://example.com"}' },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /https:\/\/example\.com/);
});

test("falls back to the raw arguments when they do not parse as JSON", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener({ name: "web_fetch", arguments: "not json" }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /not json/);
});

test("allows a tool that cannot reach the network", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const allow = { kind: "allow" };
	const decision = await host.preExecuteListener({ name: "read_file", arguments: "{}" }, () => allow);
	assert.equal(decision, allow);
});
