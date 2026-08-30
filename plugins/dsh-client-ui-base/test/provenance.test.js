/**
 * Story 4.5 — clicking a finding shows the crop it was read from.
 *
 * Two halves, tested where each lives:
 *
 *   - the host's provenance route (`lib/findings/provenance.js`), against the
 *     real shipped capture and the real shipped page images, not a stub — the
 *     page sizes asserted here are the ones parsed out of those PNGs;
 *   - the browser's crop viewer, evaluated out of `lib/client.js` in a `vm`
 *     the same way `client.test.js` does, so the geometry that positions the
 *     page inside the clip box is checked as rendered style rather than as a
 *     function nobody calls.
 *
 * Uses `node:test` and `node:assert` only.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
	buildProvenancePayload,
	citedPages,
	createProvenanceHandler,
	pageNumberFromPath,
	pngSize,
	PROVENANCE_ROUTE_PREFIX,
} from "../lib/findings/provenance.js";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const findingsPath = join(packageDir, "lib", "findings", "sample-report-findings.json");
const pagesDir = join(packageDir, "lib", "findings", "pages");

/** A `ServerResponse` stand-in that records what the handler wrote. */
function stubResponse() {
	return {
		statusCode: null,
		headers: null,
		body: undefined,
		writeHead(status, headers) {
			this.statusCode = status;
			this.headers = headers ?? null;
		},
		end(body) {
			this.body = body;
		},
	};
}

/* ---------------------------------------------------------------------------
 * The host half: the route that serves the capture and the real page images
 * ------------------------------------------------------------------------ */

test("the shipped page images are the real fixture pages, and their size is read from the PNG itself", () => {
	const page1 = pngSize(readFileSync(join(pagesDir, "sample-inspection-report-p1.png")));
	const page2 = pngSize(readFileSync(join(pagesDir, "sample-inspection-report-p2.png")));
	// 2481 x 3508 px is A4 at the 300 dpi the ingestion service renders and OCRs
	// at (services/ingestion/fixtures/README.md, CONTRACT.md) — the pixel space
	// every bounding box in the capture is expressed in.
	assert.deepEqual(page1, { width: 2481, height: 3508 });
	assert.deepEqual(page2, { width: 2481, height: 3508 });
});

test("the page images shipped here are byte-identical to the Epic 4 fixtures they were copied from", () => {
	const fixtures = join(dirname(dirname(packageDir)), "services", "ingestion", "fixtures");
	for (const name of ["sample-inspection-report-p1.png", "sample-inspection-report-p2.png"]) {
		assert.ok(
			readFileSync(join(pagesDir, name)).equals(readFileSync(join(fixtures, name))),
			`${name} has drifted from the ingestion fixture it is a copy of`,
		);
	}
});

test("bytes that are not a PNG report no size rather than a guessed one", () => {
	assert.equal(pngSize(Buffer.from("not a png at all, but long enough to read")), null);
	assert.equal(pngSize(Buffer.alloc(4)), null);
	assert.equal(pngSize("a string"), null);
});

test("the page manifest is driven by the pages the findings actually cite", () => {
	assert.deepEqual(citedPages([{ page: 2 }, { page: 1 }, { page: 2 }]), [1, 2]);
	assert.deepEqual(citedPages([{ page: 0 }, { page: -1 }, { page: 1.5 }, {}]), []);
	assert.deepEqual(citedPages("not an array"), []);
});

test("the payload carries the real capture and a page manifest with each page's real size", () => {
	const payload = buildProvenancePayload({ findingsPath, pagesDir });
	assert.equal(payload.report, "sample-inspection-report.pdf");
	assert.ok(payload.findings.length > 0, "the shipped capture is empty");
	assert.deepEqual(payload.pages, [
		{ page: 1, available: true, width: 2481, height: 3508 },
		{ page: 2, available: true, width: 2481, height: 3508 },
	]);
	for (const finding of payload.findings) {
		assert.ok(Number.isInteger(finding.page) && finding.page > 0, "a finding carries no page number");
		assert.ok(finding.bbox && typeof finding.bbox.left === "number", "a finding carries no bounding box");
	}
});

test("every bounding box in the capture lies inside the page it says it was read from", () => {
	const payload = buildProvenancePayload({ findingsPath, pagesDir });
	const pages = new Map(payload.pages.map((page) => [page.page, page]));
	for (const finding of payload.findings) {
		const page = pages.get(finding.page);
		const { left, top, width, height } = finding.bbox;
		assert.ok(left >= 0 && top >= 0, `bbox ${JSON.stringify(finding.bbox)} starts off the page`);
		assert.ok(
			left + width <= page.width && top + height <= page.height,
			`bbox ${JSON.stringify(finding.bbox)} runs past page ${finding.page}`,
		);
	}
});

test("a cited page whose image is missing is reported as unavailable, not dropped", () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-provenance-"));
	try {
		const capture = join(dir, "findings.json");
		writeFileSync(capture, JSON.stringify([{ text: "x", bbox: { left: 0, top: 0, width: 1, height: 1 }, page: 7 }]));
		const payload = buildProvenancePayload({ findingsPath: capture, pagesDir: dir });
		assert.deepEqual(payload.pages, [{ page: 7, available: false }]);
		assert.equal(payload.findings.length, 1, "the finding was dropped along with its page");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the findings endpoint answers JSON the crop viewer can read", async () => {
	const handler = createProvenanceHandler({ findingsPath, pagesDir });
	const res = stubResponse();
	await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, res);
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
	const payload = JSON.parse(res.body.toString("utf8"));
	assert.equal(payload.findings.length, JSON.parse(readFileSync(findingsPath, "utf8")).length);
	assert.equal(payload.pages.length, 2);
});

test("a page request answers the real PNG bytes", async () => {
	const handler = createProvenanceHandler({ findingsPath, pagesDir });
	const res = stubResponse();
	await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/1` }, res);
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "image/png");
	assert.ok(res.body.equals(readFileSync(join(pagesDir, "sample-inspection-report-p1.png"))));
});

test("a query string on a page request is not mistaken for part of the page number", async () => {
	const handler = createProvenanceHandler({ findingsPath, pagesDir });
	const res = stubResponse();
	await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/2?rev=abc` }, res);
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "image/png");
});

test("a page the report does not have is a 404, and a traversal attempt is not a page at all", async () => {
	const handler = createProvenanceHandler({ findingsPath, pagesDir });
	for (const url of [`${PROVENANCE_ROUTE_PREFIX}/pages/9`, `${PROVENANCE_ROUTE_PREFIX}/pages/../../secret`]) {
		const res = stubResponse();
		await handler({ method: "GET", url }, res);
		assert.equal(res.statusCode, 404, `${url} did not 404`);
	}
	assert.equal(pageNumberFromPath(`${PROVENANCE_ROUTE_PREFIX}/pages/../../etc/passwd`), null);
	assert.equal(pageNumberFromPath(`${PROVENANCE_ROUTE_PREFIX}/pages/1x`), null);
	assert.equal(pageNumberFromPath("/somewhere/else/pages/1"), null);
	assert.equal(pageNumberFromPath(`${PROVENANCE_ROUTE_PREFIX}/pages/3`), 3);
});

test("a HEAD request answers the headers and no body; anything but GET or HEAD is refused", async () => {
	const handler = createProvenanceHandler({ findingsPath, pagesDir });
	const head = stubResponse();
	await handler({ method: "HEAD", url: `${PROVENANCE_ROUTE_PREFIX}/pages/1` }, head);
	assert.equal(head.statusCode, 200);
	assert.equal(head.body, undefined);

	const post = stubResponse();
	await handler({ method: "POST", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, post);
	assert.equal(post.statusCode, 405);
});

test("an unreadable capture answers an error the panel can report, rather than throwing into the server", async () => {
	const handler = createProvenanceHandler({ findingsPath: join(pagesDir, "does-not-exist.json"), pagesDir });
	const res = stubResponse();
	await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, res);
	assert.equal(res.statusCode, 500);
	assert.match(String(res.body), /unavailable/);
});

/* ---------------------------------------------------------------------------
 * The browser half: the crop viewer
 * ------------------------------------------------------------------------ */

/** A jsx runtime whose elements are plain, inspectable objects. */
const jsxRuntime = {
	jsx: (type, props, key) => ({ type, props, key }),
	jsxs: (type, props, key) => ({ type, props, key }),
	Fragment: Symbol("Fragment"),
};

/**
 * Evaluate the browser half with a React seam whose `useState` returns values
 * this test seats, in hook order, so a component can be rendered at a chosen
 * state without a DOM or a React runtime.
 * @param states - one entry per `useState` call, in the order the component makes them.
 */
function loadProvenanceView(states) {
	const seated = [...states];
	const setters = [];
	const hostModules = {
		"react/jsx-runtime": jsxRuntime,
		react: {
			useEffect: () => {},
			useRef: (initial) => ({ current: initial }),
			useState: (initial) => {
				const value = seated.length > 0 ? seated.shift() : initial;
				const setter = (next) => setters.push(next);
				return [value, setter];
			},
			useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
		},
		"@deepseek-ai/dsh-client-ui-primitives": {
			IconAgentPresetOutline16: () => {},
			Pill: (props) => ({ type: "Pill", props }),
			StateDot: (props) => ({ type: "StateDot", props }),
			Menu: (props) => ({ type: "Menu", props }),
			Button: (props) => ({ type: "Button", props }),
		},
	};

	let registered;
	const context = {
		document: { title: "Faraday", querySelector: () => null },
		console: { error: () => {}, warn: () => {} },
		window: { __ModuleLoader__: { load: (entry) => { registered = entry; } } },
	};
	vm.runInNewContext(readFileSync(join(packageDir, "lib", "client.js"), "utf8"), context, { filename: "client.js" });

	const slotEntries = [];
	const ctx = {
		slots: {
			inject: (name, register) => {
				if (name === "conversation.view") register();
				return () => {};
			},
			register: (options, component) => {
				slotEntries.push({ options, component });
				return () => {};
			},
		},
		conversationViews: { register: () => () => {} },
		conversationEvents: { register: () => () => {} },
		sessions: { binding: () => null, list: null },
		inject: () => {},
	};
	registered.factory((name) => {
		if (name in hostModules) return hostModules[name];
		throw new Error(`unexpected require: ${name}`);
	}).apply(ctx);

	const entry = slotEntries.find((candidate) => candidate.options.name === "conversation.view");
	assert.ok(entry, "nothing was registered into conversation.view");
	return { entry, setters };
}

/** Depth-first search of a rendered element tree. */
function findNode(node, predicate) {
	if (node === null || node === undefined || typeof node !== "object") return null;
	if (Array.isArray(node)) {
		for (const child of node) {
			const hit = findNode(child, predicate);
			if (hit !== null) return hit;
		}
		return null;
	}
	if (predicate(node)) return node;
	return findNode(node.props?.children ?? null, predicate);
}

/** Every node in a rendered element tree matching `predicate`. */
function findAll(node, predicate, into = []) {
	if (node === null || node === undefined || typeof node !== "object") return into;
	if (Array.isArray(node)) {
		for (const child of node) findAll(child, predicate, into);
		return into;
	}
	if (predicate(node)) into.push(node);
	return findAll(node.props?.children ?? null, predicate, into);
}

/** The whole text content of a rendered element tree. */
function textOf(node, parts = []) {
	if (node === null || node === undefined) return parts;
	if (typeof node === "string" || typeof node === "number") {
		parts.push(String(node));
		return parts;
	}
	if (Array.isArray(node)) {
		for (const child of node) textOf(child, parts);
		return parts;
	}
	if (typeof node === "object") return textOf(node.props?.children ?? null, parts);
	return parts;
}

/**
 * The crop's clipping box: positioned, clipped, and sized in pixels. The
 * findings list's own truncated text also sets `overflow: hidden`, so the
 * predicate has to name all three.
 */
function isClipBox(node) {
	const style = node.props?.style;
	return style?.overflow === "hidden" && style?.position === "relative" && typeof style?.width === "string";
}

/** Two findings on two pages, shaped exactly like the ingestion capture. */
const PAYLOAD = {
	report: "sample-inspection-report.pdf",
	pages: [
		{ page: 1, available: true, width: 2481, height: 3508 },
		{ page: 2, available: true, width: 2481, height: 3508 },
	],
	findings: [
		{ text: "Report no. NRC/RVF/INSP/2026-0417", bbox: { left: 199, top: 505, width: 792, height: 58 }, confidence: 99.97, page: 1 },
		{ text: "Shell thickness 9.1 mm", bbox: { left: 400, top: 1200, width: 300, height: 60 }, confidence: 96.5, page: 2 },
	],
};

test("the crop viewer occupies conversation.view as a labelled tab", () => {
	const { entry } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, null]);
	assert.equal(entry.options.name, "conversation.view");
	assert.equal(entry.options.id, "bf-provenance");
	assert.equal(entry.options.label, "Provenance");
	assert.notEqual(entry.options.name, "root");
});

test("every finding in the ingested report is listed, with the page it was read from", () => {
	const { entry } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, null]);
	const rendered = entry.component({});
	const rows = findAll(rendered, (node) => node.key?.startsWith?.("bf-finding:"));
	assert.equal(rows.length, 2);
	assert.match(textOf(rows[0]).join(" "), /p1/);
	assert.match(textOf(rows[0]).join(" "), /NRC\/RVF\/INSP\/2026-0417/);
	assert.match(textOf(rows[1]).join(" "), /p2/);
});

test("nothing is cropped until a finding is clicked, and clicking one selects it", () => {
	const { entry, setters } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, null]);
	const rendered = entry.component({});
	assert.equal(findNode(rendered, (node) => node.type === "img"), null, "a crop was shown before anything was clicked");
	assert.match(textOf(rendered).join(" "), /Click a finding/);

	const row = findAll(rendered, (node) => node.key?.startsWith?.("bf-finding:"))[1];
	row.props.onClick();
	assert.deepEqual(setters, [1], "clicking a finding did not select it");
});

test("the selected finding's crop is the region its bounding box records, cut from the real page image", () => {
	// Seat the second finding as selected: bbox 300 x 60 at (400, 1200) on page 2.
	const { entry } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, 1]);
	const rendered = entry.component({});

	const image = findNode(rendered, (node) => node.type === "img");
	assert.ok(image, "no page image was rendered");
	// The page image itself, served by the host — not a pre-rendered crop file.
	assert.equal(image.props.src, "/blind-flange/provenance/pages/2");

	// 300 x 60 fitted into the 560 x 200 box: 560/300 = 1.866…, 200/60 = 3.333…,
	// capped at 3 — so the width bound wins at 1.8666… and the clip box is the
	// bounding box at that scale.
	const scale = 560 / 300;
	const clip = findNode(rendered, isClipBox);
	assert.equal(clip.props.style.width, `${Math.round(300 * scale * 100) / 100}px`);
	assert.equal(clip.props.style.height, `${Math.round(60 * scale * 100) / 100}px`);

	// The page is rendered whole at that same scale and pushed by the box's own
	// origin, so exactly the recorded region lands in the opening.
	assert.equal(image.props.style.width, `${Math.round(2481 * scale * 100) / 100}px`);
	assert.equal(image.props.style.height, `${Math.round(3508 * scale * 100) / 100}px`);
	assert.equal(image.props.style.left, `${Math.round(-400 * scale * 100) / 100}px`);
	assert.equal(image.props.style.top, `${Math.round(-1200 * scale * 100) / 100}px`);
});

test("a tall region is scaled to fit the box's height instead of its width", () => {
	const payload = {
		...PAYLOAD,
		findings: [{ text: "a column", bbox: { left: 10, top: 20, width: 300, height: 400 }, confidence: 90, page: 1 }],
	};
	const { entry } = loadProvenanceView([{ status: "ready", payload }, 0]);
	const rendered = entry.component({});
	const scale = 200 / 400; // the height bound is the tighter of the two
	const clip = findNode(rendered, isClipBox);
	assert.equal(clip.props.style.width, `${300 * scale}px`);
	assert.equal(clip.props.style.height, `${400 * scale}px`);
});

test("the caption states the page and the region, not just the file", () => {
	const { entry } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, 0]);
	const text = textOf(entry.component({})).join(" ");
	assert.match(text, /Page 1/);
	assert.match(text, /region 199, 505/);
	assert.match(text, /792 × 58 px/);
	assert.match(text, /99\.97|100\.0%|99\.97%|100%/);
});

test("a finding whose page image the report does not have says so instead of showing the wrong page", () => {
	const payload = {
		report: "sample-inspection-report.pdf",
		pages: [{ page: 3, available: false }],
		findings: [{ text: "on a page we cannot show", bbox: { left: 1, top: 1, width: 10, height: 10 }, confidence: 80, page: 3 }],
	};
	const { entry } = loadProvenanceView([{ status: "ready", payload }, 0]);
	const rendered = entry.component({});
	assert.equal(findNode(rendered, (node) => node.type === "img"), null);
	assert.match(textOf(rendered).join(" "), /Page 3 of the report is not available/);
});

test("the panel says so when the findings cannot be read, rather than rendering an empty crop", () => {
	const { entry } = loadProvenanceView([{ status: "error", message: "the findings route answered 500" }, null]);
	const text = textOf(entry.component({})).join(" ");
	assert.match(text, /could not be read/);
	assert.match(text, /the findings route answered 500/);
});

test("the crop viewer sets no hand-rolled colour of its own", () => {
	const { entry } = loadProvenanceView([{ status: "ready", payload: PAYLOAD }, 0]);
	const rendered = entry.component({});
	const styled = findAll(rendered, (node) => node.props?.style !== undefined);
	assert.ok(styled.length > 0);
	for (const node of styled) {
		for (const [property, value] of Object.entries(node.props.style)) {
			if (typeof value !== "string") continue;
			assert.ok(
				!/#[0-9a-fA-F]{3,8}\b/.test(value) && !/\b(rgb|rgba|hsl|hsla)\(/.test(value),
				`${property}: ${value} is a hand-rolled colour; use a --dsw-* token`,
			);
		}
	}
});
