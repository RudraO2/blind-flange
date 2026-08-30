/**
 * Faraday base plugin, browser half.
 *
 * Written directly in the host loader's module format, so this package ships no
 * React and needs no bundler: `require` inside the factory resolves
 * `react/jsx-runtime` and every `@deepseek-ai/dsh-client-*` package from the
 * host at load time.
 *
 * Deliberately not an ES module, despite `"type": "module"` in the manifest.
 * The host serves this file as a raw bundle to the browser's module loader and
 * never `import`s it, so it is written as the loader's own format — a top-level
 * `window.__ModuleLoader__.load(...)` call with a CommonJS-shaped factory. Only
 * `exports["./client"]` points here, and only the host reads that.
 *
 * Story 1.1 mounted the seam and took no slot. Story 1.5 is the first
 * occupant: the Faraday mark in `conversation.hero.brand.mark` and
 * `sidebar.brand.mark`, the two places the DeepSeek whale used to render (see
 * `apply` below for why both, not just the one AC1 names). What Story 1.1 did
 * do is check that the host supplied the React seam every later panel depends
 * on, so a broken seam is reported here, by package name, instead of
 * surfacing as an obscure failure inside the routing chip or the egress
 * monitor — kept as-is below.
 *
 * Story 1.4 takes this package's first slot: `conversation.hero.agentPreset`.
 * The host's own agent-preset roster always includes its four shipped presets
 * (`standard`/`code`/`minimal`/`cordis`) alongside ours — `dsh-agent-presets`
 * hard-codes its shipped root into every deployment's resolved config, so a
 * profile patch cannot remove them (verified against a running `dsh web`,
 * 28 Aug 2026: `agentPreset.list` names all four no matter what this profile's
 * `cordis.patch.yml` configures). This component is an indicator rather than a
 * wrapper around the host's own hero chip: it reads the same roster over the
 * same host RPCs and shows only the presets Faraday authored
 * (`trust: 'user'`), so "Standard mode" and its shipped siblings never appear
 * here even though the host still lists them elsewhere (Settings > Agent
 * presets, unavoidably, for the same reason).
 *
 * It shipped as a dropdown and was corrected to a read-only indicator on
 * 28 Aug 2026: SIH26117 requires the system to pick automatically, so a control
 * asking the operator to classify the task contradicts the entry's own claim.
 *
 * Story 3.8 — "the model changes by itself when the task type changes" — lives
 * on the routing chip, not here. `conversation.hero.*` is the new-session
 * screen: `@deepseek-ai/dsh-client-ui-agent-preset`'s own `AgentPresetSeat`
 * records that the hero seat "is only available before a conversation starts",
 * and the hero is replaced by the conversation view once a turn runs — so the
 * hero indicator is never on screen at the moment a mid-session reclassification
 * happens. This indicator therefore stays a new-session affordance showing the
 * deployment's authored task types; the surface that visibly moves when the
 * router reclassifies is the routing chip at `conversation.input.model`, which
 * re-reads the `bf-routing` view every turn (see `buildRoutingChip`).
 *
 * Story 3.2 takes one more seat: `conversation.session.header.utilities`, a
 * read-only pill naming the active model-plane provider. When `replay` is the
 * provider it says so in plain words and says the responses are authored, not
 * captured (ADR-0001 amendment, 28 Aug 2026). The provider name is read from
 * the host's `llm.providers` directory — the Faraday adapter registered
 * in the host half (`index.js`) surfaces there as `Faraday (<provider>)` —
 * so this indicator reports the configured provider rather than guessing it.
 *
 * Story 3.7 takes the last seat: `conversation.input.model`, a `single` slot,
 * so occupying it replaces the stock model picker outright
 * (`@deepseek-ai/dsh-client-ui-model-selection` is disabled in the profile —
 * docs/profile-install.md, Story 3.7 section). This is the routing chip
 * (CONTEXT.md): it names the fleet member the router picked for the last turn
 * and expands to show the working — the classified task type, the score per
 * fleet member, and the members filtered out before scoring with the reason
 * each was. The decision is not recomputed here: the host half appends a
 * `router/routed` session event per turn (Story 3.6), and this reads it back
 * through a registered conversation view (`bf-routing`) folded from that
 * event, so the chip shows the decision the router actually recorded — never
 * an animation without an event behind it (NFR8).
 *
 * Story 2.2 adds the egress monitor: a compact chip sharing
 * `conversation.session.header.utilities` and a full panel in `shell.overlay`.
 * Both show one number — the count of `egress/denied` session events the
 * denial waterfall records (host half) — folded through a registered
 * `bf-egress` conversation view. The zero is counted, never a literal (FR15),
 * and it is the rebuild of the 27 August spike's hand-rolled monitor against
 * the shipped primitives and theme tokens (UX-DR7).
 *
 * Story 2.3 adds the canary: a button in `conversation.input.right` that posts
 * to the host's loopback `/bf-canary` channel. The host dispatches a real tool
 * whose body calls `fetch`, the egress denial waterfall refuses it before that
 * body runs, and the monitor above turns red off the recorded denial rather
 * than off anything the button says.
 *
 * Story 2.4 adds no seat either. The egress monitor's full panel becomes the
 * audit surface: it lists every recorded denial — the timestamp the harness
 * stamped on the event, the tool, and the refused target — in the order the log
 * wrote them. The lines come from the same `bf-egress` view the count comes
 * from, so reading the log on screen needs no terminal and a fresh denial lands
 * in the list through the subscription that was already there.
 *
 * Story 4.5 adds the provenance crop viewer, this package's first
 * `conversation.view` seat — a whole tab. It lists every OCR finding the
 * ingestion service returned for the sample inspection report and, when one is
 * clicked, shows the region of the real scanned page that finding's bounding
 * box covers. The crop is cut in the browser from the full page image the host
 * serves (`findings/provenance.js`), so there is no pre-rendered crop anywhere
 * in this package and a changed bounding box moves the pixels on screen.
 *
 * Story 3.8 adds no seat. Because the `bf-routing` view keeps the highest-seq
 * `router/routed` node and the chip subscribes through `useSyncExternalStore`,
 * a turn that classifies as a different task type moves the chip to the newly
 * selected fleet member — trigger and expanded working both — with no user
 * action. Story 3.8 is the regression cover for that cross-turn behaviour.
 */
window.__ModuleLoader__.load({
	id: "@blind-flange/dsh-client-ui-base",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** Everything a Faraday panel needs from the host's React. */
		const REQUIRED_JSX_EXPORTS = ["jsx", "jsxs", "Fragment"];

		/**
		 * A bolted-shut pipe flange, six holes around a solid plate — the
		 * metaphor the project is named for. `fill="currentColor"` so it
		 * inherits the hero's own text colour rather than a hard-rolled hex,
		 * which is what makes it correct in both themes without a media query.
		 */
		/**
		 * The Faraday mark, from `Logo.svg`.
		 *
		 * Authored at 1254pt and drawn through the group transform below, which is
		 * how the artwork was exported. Rescaling the coordinates by hand would risk
		 * shifting the curves for no gain, and the transform costs nothing.
		 * `favicon.svg` carries the same two paths for the browser tab.
		 */
		const MARK_PATHS = [
			"M5985 10174 c-371 -82 -622 -388 -707 -864 -9 -54 -13 -182 -13 -460 l0 -385 27 -57 c34 -74 95 -132 166 -159 46 -17 72 -20 137 -17 100 6 163 35 228 108 73 81 77 104 77 454 0 328 9 441 46 556 31 98 73 161 127 190 41 22 44 22 105 6 180 -46 402 -275 519 -536 63 -140 110 -308 139 -495 14 -92 16 -180 15 -530 -2 -461 2 -503 57 -575 38 -50 60 -68 122 -98 74 -36 209 -39 282 -5 66 30 132 95 157 154 22 49 22 60 22 512 0 587 -17 737 -116 1056 -122 393 -345 734 -614 936 -105 80 -278 167 -386 195 -108 29 -295 35 -390 14z m396 -140 c70 -21 217 -94 283 -140 315 -226 564 -651 661 -1130 47 -231 56 -370 53 -832 -3 -409 -4 -421 -24 -449 -26 -35 -81 -73 -105 -73 -18 0 -19 19 -19 473 0 601 -14 750 -101 1052 -140 490 -446 918 -776 1085 -65 33 -54 38 28 14z m-376 -396 c-41 -22 -104 -98 -133 -160 -67 -142 -82 -258 -82 -651 0 -264 -3 -324 -15 -355 -17 -39 -52 -82 -68 -82 -5 0 -7 166 -5 403 4 379 6 407 27 487 48 177 132 305 234 354 49 23 84 27 42 4z",
			"M4210 7427 l0 -982 138 -85 c75 -46 389 -239 697 -429 308 -189 619 -380 690 -424 72 -44 273 -169 447 -278 572 -358 909 -561 923 -555 12 4 282 168 688 418 70 43 129 78 132 78 3 0 5 -127 5 -282 l0 -283 -183 -111 c-100 -61 -286 -175 -414 -253 -128 -77 -235 -141 -239 -141 -4 0 -39 20 -78 44 -427 263 -1515 938 -1906 1181 -272 169 -574 356 -671 415 -97 59 -188 115 -202 125 l-27 17 0 -358 0 -359 123 -74 c302 -184 941 -580 1492 -926 752 -472 1213 -760 1241 -777 l31 -18 189 118 c104 65 340 212 524 326 184 115 408 254 497 310 l163 101 0 988 c0 543 -2 987 -5 987 -6 0 -42 -22 -700 -425 -258 -158 -514 -314 -568 -347 -60 -37 -104 -57 -114 -54 -9 4 -203 123 -432 265 -408 253 -783 485 -1091 673 -434 266 -747 456 -767 467 l-23 12 0 284 c0 157 2 285 5 285 3 0 121 -71 263 -159 256 -158 527 -325 972 -599 246 -151 367 -226 790 -487 140 -87 265 -162 277 -168 25 -11 32 -6 743 433 228 141 467 288 530 327 l115 70 3 348 c2 286 0 346 -11 342 -7 -3 -177 -106 -378 -229 -502 -310 -976 -598 -982 -598 -4 0 -178 106 -389 236 -1000 618 -2318 1427 -2449 1505 l-49 28 0 -982z",
		];

		/**
		 * The Faraday mark. Same `size`/`className` shape the host's own
		 * `OfficialBrandMark` takes, since `conversation.hero.brand.mark` is a
		 * `single` slot and this occupies it outright.
		 */
		function FaradayMark({ size, className }) {
			let jsxRuntime;
			try {
				jsxRuntime = require("react/jsx-runtime");
			} catch {
				return null;
			}
			if (typeof jsxRuntime?.jsx !== "function") return null;
			return jsxRuntime.jsxs("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 1254 1254",
				width: size,
				height: size,
				className,
				"aria-hidden": true,
				focusable: "false",
				children: jsxRuntime.jsx("g", {
					transform: "translate(0,1254) scale(0.1,-0.1)",
					children: MARK_PATHS.map((d, index) => jsxRuntime.jsx("path", { d, fill: "currentColor", fillRule: "evenodd" }, `m${index}`)),
				}),
			});
		}

		/**
		 * Report anything missing from the host's React seam. Resolution happens
		 * here rather than at factory scope so that an unresolvable module is
		 * reported by name instead of throwing before this check can run.
		 * @returns whether the seam is usable.
		 */
		function checkHostReactSeam() {
			let jsxRuntime;
			try {
				jsxRuntime = require("react/jsx-runtime");
			} catch (error) {
				console.error(
					"@blind-flange/dsh-client-ui-base: the host did not supply react/jsx-runtime — no Faraday panel can render",
					error,
				);
				return false;
			}
			const missing = REQUIRED_JSX_EXPORTS.filter((name) => jsxRuntime?.[name] === undefined);
			if (missing.length > 0) {
				console.error(
					`@blind-flange/dsh-client-ui-base: the host's react/jsx-runtime is missing ${missing.join(", ")} — Faraday panels will not render correctly`,
				);
				return false;
			}
			return true;
		}

		let rpcCounter = 0;

		/**
		 * Call one host RPC method over the same wire the client SDK uses, without
		 * requiring this bundler-free package to ship a copy of that SDK.
		 * @param method - dotted RPC method name, e.g. "agentPreset.list".
		 * @param payload - the method's request payload.
		 * @returns the envelope's `result` — `{ ok: true, value }` or `{ ok: false, error }`.
		 */
		function callApi(method, payload) {
			rpcCounter += 1;
			const rpcId = `bf-${Date.now().toString(36)}-${String(rpcCounter)}`;
			return fetch(`/api/${method}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
			})
				.then((response) => response.json())
				.then((body) => body.result)
				.catch((error) => ({ ok: false, error: { message: String(error) } }));
		}

		/**
		 * Build the hero task-type picker component. Built inside a function
		 * (rather than at module scope) so every host module it needs is resolved
		 * once, at mount time, alongside the React seam check.
		 * @returns the component.
		 */
		function buildTaskTypeIndicator() {
			const { useEffect, useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { IconAgentPresetOutline16 } = require("@deepseek-ai/dsh-client-ui-primitives");

			const INITIAL = { status: "loading", label: "" };

			/**
			 * The hero's task-type indicator: shows which task type is active, and
			 * offers no way to change it.
			 *
			 * Story 1.4 originally shipped this seat as a dropdown the operator picked
			 * from. That was corrected on 28 Aug 2026: SIH26117 asks for a system that
			 * "automatically picks the right one for a given task", and a control that
			 * asks the operator to classify the task is the human doing the router's
			 * job. It also collided with Story 3.7's routing chip at
			 * `conversation.input.model` — a different seat — so the two would have
			 * shipped side by side making opposite claims about the same decision.
			 *
			 * The read path below is the new-session task type only. It does not
			 * track the router mid-session: the hero is gone by the time a turn
			 * reclassifies (see the file header). Story 3.8's "shows it moving"
			 * surface is the routing chip at `conversation.input.model`.
			 *
			 * Rendered as a bare inherited element rather than a `Button`. There is no
			 * tag or badge primitive in the harness, a `Button` with no handler still
			 * reads as clickable, and a disabled one reads as broken. An unstyled
			 * element inherits the hero's own typography and density, which is what the
			 * design rule asks for and costs no hand-rolled colour, radius or spacing.
			 * @returns the indicator, or null while loading and when the deployment
			 * authors no Faraday preset.
			 */
			function TaskTypeIndicator() {
				const [state, setState] = useState(INITIAL);

				useEffect(() => {
					let cancelled = false;
					callApi("agentPreset.list", {}).then((result) => {
						if (cancelled || !result.ok) return;
						const ours = result.value.presets.filter(
							(preset) => preset.trust === "user" && preset.broken === undefined,
						);
						if (ours.length === 0) return;
						const active = ours.find((preset) => preset.isDefault) ?? ours[0];
						setState({ status: "ready", label: active.name ?? active.id });
					});
					return () => {
						cancelled = true;
					};
				}, []);

				if (state.status !== "ready") return null;

				return jsxs("span", {
					title: "Task type, selected by the router. Faraday classifies the request; there is nothing here to set.",
					children: [jsx(IconAgentPresetOutline16, {}), " ", state.label],
				});
			}

			return TaskTypeIndicator;
		}

		/**
		 * Plain-words disclosure for each model-plane provider. Keyed by the
		 * provider token the host half selects (`config.modelPlane.provider`) and
		 * reports back through `llm.providers`.
		 *
		 * The `replay` wording is load-bearing: it says "replay" outright, and it
		 * says the responses are *authored* rather than captured, because for
		 * Phase 0 there is no `local` run to capture from (ADR-0001 amendment,
		 * 28 August 2026). None of these read as a warning or an apology — the
		 * pill states the operating mode the way an instrument states a reading.
		 */
		const PROVIDER_DISCLOSURE = {
			replay: {
				label: "Replay — authored responses",
				title:
					"Faraday is answering from the replay provider: stored responses authored by hand for this Phase 0 build, served in place of live model inference and disclosed here as the operating mode. Per the 28 August 2026 amendment to ADR-0001 there is no local run to capture from yet, so replacing an authored response with a captured one later is a data change, not a code change.",
			},
			local: {
				label: "Local — offline inference",
				title:
					"Faraday is answering from the local provider: llama.cpp on this machine, with no network path off the box.",
			},
			remote: {
				label: "Remote — development only",
				title:
					"Faraday is answering from the remote provider: a rented GPU used only during development. ADR-0001 keeps it out of every demo and recording.",
			},
		};

		/**
		 * Build the header's active-provider disclosure.
		 *
		 * A read-only pill, never a control: which provider answers is a
		 * `cordis.patch.yml` value (`config.modelPlane.provider`), not something
		 * an operator sets from the UI. Built inside a function so every host
		 * module it needs is resolved once, at mount time.
		 * @returns the component.
		 */
		function buildProviderDisclosure() {
			const { useEffect, useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Pill, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			/**
			 * The active model-plane provider, named without a menu.
			 *
			 * Reads the host's `llm.providers` directory and finds the Blind
			 * Flange adapter by its `Faraday (<provider>)` display name — the
			 * shape `createLlmAdapter` gives it in `model-plane/llm-adapter.js`.
			 * Renders nothing until that lookup resolves and nothing if it fails:
			 * an unproven provider name is worse than an absent pill (NFR8).
			 * @returns the pill, or null.
			 */
			function ProviderDisclosure() {
				const [provider, setProvider] = useState(null);

				useEffect(() => {
					let cancelled = false;
					callApi("llm.providers", {}).then((result) => {
						if (cancelled || !result.ok) return;
						const ours = result.value.providers.find(
							(row) =>
								typeof row.displayName === "string" &&
								row.displayName.startsWith("Faraday (") &&
								row.active === true,
						);
						if (ours) setProvider(ours.provider);
					});
					return () => {
						cancelled = true;
					};
				}, []);

				if (provider === null) return null;

				const disclosure = PROVIDER_DISCLOSURE[provider] ?? {
					label: `Model plane — ${provider}`,
					title: `Faraday is answering from the ${provider} provider.`,
				};

				return jsx(Pill, {
					children: jsxs("span", {
						title: disclosure.title,
						style: { display: "inline-flex", alignItems: "center", gap: "4px" },
						children: [jsx(StateDot, { state: "done", size: 8 }), disclosure.label],
					}),
				});
			}

			return ProviderDisclosure;
		}

		/**
		 * The plugin-owned session event the host half's router appends per turn
		 * (Story 3.6, `index.js` `ROUTED_EVENT`). Its data is the whole
		 * `RoutingDecision`: `{ taskType, scored, excluded, selected, tied, allZero }`.
		 */
		const ROUTED_EVENT = "router/routed";

		/**
		 * The conversation view target and Definition kind the routing chip reads.
		 * The Definition folds every `router/routed` event into a node; the view
		 * builder keeps the one from the latest turn (highest `anchorSeq`), which
		 * is the decision the chip shows.
		 */
		const ROUTING_VIEW_TARGET = "bf-routing";
		const ROUTING_DEFINITION_KIND = "bf-routing";

		/**
		 * View builder for {@link ROUTING_VIEW_TARGET}: retains the routing
		 * decision from the highest-seq `router/routed` node it has seen. Routing
		 * events are append-only and one-per-turn, so "highest seq" is "latest
		 * turn" and an older node never supersedes a newer one.
		 * @returns a `ConversationViewBuilder` — `{ empty, replace, apply }`.
		 */
		function createRoutingViewBuilder() {
			const empty = { decision: null };
			let bestSeq = -1;
			let snapshot = empty;
			function consider(node) {
				if (node && typeof node.anchorSeq === "number" && node.anchorSeq >= bestSeq) {
					bestSeq = node.anchorSeq;
					snapshot = { decision: node.data };
				}
			}
			return {
				empty,
				replace(input) {
					bestSeq = -1;
					snapshot = empty;
					for (const node of input.nodes) consider(node);
					return snapshot;
				},
				apply(input) {
					for (const node of input.upserts) consider(node);
					return snapshot;
				},
			};
		}

		/** The view Definition registered with `ctx.conversationViews`. */
		const routingViewDefinition = {
			target: ROUTING_VIEW_TARGET,
			create: createRoutingViewBuilder,
		};

		/**
		 * The event Definition registered with `ctx.conversationEvents`. A
		 * single-event business: each `router/routed` event is its own Context,
		 * keyed by the event's own seq, and carries the whole decision as state.
		 */
		const routingNodeDefinition = {
			kind: ROUTING_DEFINITION_KIND,
			target: ROUTING_VIEW_TARGET,
			match(event) {
				return event && event.type === ROUTED_EVENT
					? { id: String(event.seq), role: "start" }
					: null;
			},
			start(_context, match) {
				return match.event.data;
			},
			update(context) {
				return context.state;
			},
			buildViewNode(context) {
				if (context.state === undefined) return null;
				return {
					key: context.key,
					kind: ROUTING_DEFINITION_KIND,
					id: context.id,
					target: ROUTING_VIEW_TARGET,
					anchorSeq: context.start?.event?.seq ?? 0,
					data: context.state,
				};
			},
		};

		/**
		 * Drop the `Qwen/` org prefix for the chip's compact surfaces; the full
		 * id still rides `title` attributes and the expanded rows.
		 * @param name - a fleet member id, e.g. `Qwen/Qwen2.5-VL-7B-Instruct`.
		 */
		function shortMemberName(name) {
			if (typeof name !== "string") return String(name ?? "");
			const slash = name.lastIndexOf("/");
			return slash >= 0 ? name.slice(slash + 1) : name;
		}

		/**
		 * Build the `Menu` entries that show the router's working: the classified
		 * task type, one scored row per fleet member (the selected one carries the
		 * check), and one row per member filtered out before scoring with its
		 * reason. Everything is `Menu` primitive chrome; only flexbox layout and
		 * `ui-theme` colour tokens are set inline.
		 * @param decision - the `RoutingDecision` from the `router/routed` event.
		 * @param jsx - host `react/jsx-runtime` `jsx`.
		 * @param jsxs - host `react/jsx-runtime` `jsxs`.
		 * @returns `MenuEntry[]`.
		 */
		function buildRoutingMenuItems(decision, jsx, jsxs) {
			const SECONDARY = { color: "var(--dsw-alias-label-secondary)" };
			const items = [];

			// `tied` / `allZero` come straight from the scorer (Story 3.6): a
			// score tie is broken by fleet declaration order, and `allZero` means
			// no eligible member declared a capability this task type scores.
			const taskNotes = [];
			if (decision.tied) taskNotes.push("score tie — broken by fleet order");
			if (decision.allZero) taskNotes.push("no strong match");
			const taskLabel =
				decision.taskType + (taskNotes.length > 0 ? ` (${taskNotes.join("; ")})` : "");
			items.push({ type: "label", id: "bf-r-task-h", text: "Task type — classified by the router" });
			items.push({ type: "label", id: "bf-r-task", text: taskLabel });

			items.push({ type: "separator", id: "bf-r-s1" });
			items.push({ type: "label", id: "bf-r-scored-h", text: "Fleet — score per member" });
			const scored = Array.isArray(decision.scored) ? decision.scored : [];
			if (scored.length === 0) {
				items.push({ type: "label", id: "bf-r-scored-none", text: "No fleet member was eligible to score" });
			}
			for (const member of scored) {
				const matched = Array.isArray(member.matched) ? member.matched : [];
				const working =
					matched.length > 0
						? matched.map((hit) => `${hit.capability} +${hit.points}`).join(" · ")
						: decision.allZero
							? "no scored capability — first eligible member selected"
							: "no scored capability";
				items.push({
					id: `bf-r-score:${member.name}`,
					label: jsxs("span", {
						title: `${member.name} — score ${member.score}`,
						style: { display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 },
						children: [
							jsx("span", { style: { flex: "1 1 auto", minWidth: 0 }, children: shortMemberName(member.name) }),
							jsx("span", { style: SECONDARY, children: `score ${member.score}` }),
						],
					}),
				});
				items.push({ type: "label", id: `bf-r-score-w:${member.name}`, text: working });
			}

			const excluded = Array.isArray(decision.excluded) ? decision.excluded : [];
			if (excluded.length > 0) {
				items.push({ type: "separator", id: "bf-r-s2" });
				items.push({ type: "label", id: "bf-r-excl-h", text: "Filtered out before scoring" });
				for (const member of excluded) {
					const reason = member.reason || {};
					items.push({
						id: `bf-r-excl:${member.name}`,
						label: jsx("span", {
							title: reason.detail || reason.code || "",
							style: { display: "block", minWidth: 0 },
							children: shortMemberName(member.name),
						}),
					});
					items.push({
						type: "label",
						id: `bf-r-excl-r:${member.name}`,
						text: reason.detail || reason.code || "excluded before scoring",
					});
				}
			}

			// The rows are informational; nothing is selectable. A member row is
			// kept as an `item` only so the trailing check can mark the selected
			// member — the working lines below each are `label` entries, which the
			// primitive renders as wrapping tertiary text.
			return items;
		}

		/**
		 * Build the routing chip component for the `conversation.input.model`
		 * seat. Built inside a function so every host module it needs is resolved
		 * once, at mount time, alongside the React-seam check.
		 * @param ctx - client root context, carrying `sessions`.
		 * @returns the component.
		 */
		function buildRoutingChip(ctx) {
			const { useState, useSyncExternalStore } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Pill, StateDot, Menu } = require("@deepseek-ai/dsh-client-ui-primitives");

			const NO_DECISION = null;

			/**
			 * Subscribe to the session's `bf-routing` view and return the latest
			 * routing decision, or null before the first turn records one.
			 *
			 * This is the whole of Story 3.8's client side: the host half appends a
			 * fresh `router/routed` event on the first step of every turn (Story 3.6),
			 * the `bf-routing` view builder folds each into a node and keeps the
			 * highest-seq one, and `useSyncExternalStore` re-renders the chip whenever
			 * that snapshot changes. So when turn N+1 classifies as a different task
			 * type, the chip's trigger and its expanded working move to the newly
			 * selected member with no user action — driven by a recorded event, never
			 * an animation (NFR8).
			 * @param sessionId - the framework-resolved session id from the slot.
			 */
			function useRoutingDecision(sessionId) {
				const session = ctx.sessions?.binding?.(sessionId)?.session ?? null;
				return useSyncExternalStore(
					(onChange) => (session ? session.subscribe(onChange) : () => {}),
					() => {
						if (!session) return NO_DECISION;
						const view = session.getSnapshot().views.get(ROUTING_VIEW_TARGET);
						return (view && view.decision) || NO_DECISION;
					},
				);
			}

			/**
			 * The routing chip. Trigger names the selected fleet member (or
			 * "Auto-routing" before a turn records a decision); clicking it opens
			 * the working. A `single` slot with nothing to show renders a quiet
			 * non-interactive pill rather than null, so the seat the stock picker
			 * used to hold is never visibly empty.
			 * @returns the chip.
			 */
			function RoutingChip(props) {
				const decision = useRoutingDecision(props.sessionId);
				const [open, setOpen] = useState(false);
				const locked = props.locked === true;

				const selected = decision && typeof decision.selected === "string" ? decision.selected : null;
				const label = selected ? shortMemberName(selected) : "Auto-routing";
				const canOpen = decision !== NO_DECISION && !locked;

				const anchor = jsx(Pill, {
					active: open,
					onClick: canOpen ? () => setOpen((v) => !v) : undefined,
					"aria-haspopup": canOpen ? "menu" : undefined,
					"aria-expanded": canOpen ? open : undefined,
					disabled: locked,
					title: selected
						? `The router picked ${selected} for this task type. Open for the score per fleet member.`
						: "The router picks a fleet member from its classifier score once the first turn runs.",
					children: jsxs("span", {
						style: { display: "inline-flex", alignItems: "center", gap: "6px" },
						children: [
							selected ? jsx(StateDot, { state: "done", size: 8 }) : null,
							label,
						],
					}),
				});

				if (!canOpen) return anchor;

				return jsx(Menu, {
					open,
					anchor,
					items: buildRoutingMenuItems(decision, jsx, jsxs),
					selectedId: `bf-r-score:${selected}`,
					onSelect: () => {},
					onClose: () => setOpen(false),
					side: "top",
					align: "end",
					portal: true,
				});
			}

			return RoutingChip;
		}

		/* ---------------------------------------------------------------------
		 * Egress monitor (Story 2.2)
		 *
		 * The always-on display of outbound attempts (CONTEXT.md "Egress
		 * monitor"). Two seats: a compact chip in
		 * `conversation.session.header.utilities` (list, session) and a full
		 * panel in `shell.overlay` (list, root). Both read one number — the
		 * count of `egress/denied` session events the denial waterfall appends
		 * (host half, `index.js`) — folded through a registered conversation
		 * view. The zero is `that fold's node count`, never a literal (FR15),
		 * and it moves only on a real recorded denial, never an animation
		 * (NFR8). Story 2.3's canary is what first makes it non-zero on stage.
		 *
		 * This replaces the 27 August spike's `@blind-flange/dsh-client-ui-egress`
		 * (hand-written greens, a hand-rolled pill — the counter-example the UI
		 * rules exist to prevent, UX-DR7). Nothing here sets a colour: `StateDot`
		 * carries the green/red state through `--dsw-*` tokens, `Pill` and
		 * `Button` are shipped primitives, and the panel's surface uses only
		 * `ui-theme` background/border/shadow tokens.
		 *
		 * Story 2.4 makes the full panel the audit surface as well as the
		 * instrument: the same fold that produces the count also carries every
		 * denial's timestamp, tool and refused target, and the panel lists them
		 * oldest first. The decision to extend this panel rather than declare a
		 * separate audit seat is recorded in the story's spec — an evaluator who
		 * asks "show me" is already looking at the monitor, and a second surface
		 * showing the same events would be two places to keep in step.
		 * ------------------------------------------------------------------- */

		/**
		 * The four markers the host half appends, mapped to the short kind each
		 * audit line is rendered from. The monitor used to fold one of them —
		 * `egress/denied` — which made it a record of this system's own
		 * successes and nothing else. It now folds the seal being opened and
		 * closed, the calls the open seal let through, and what became of them.
		 *
		 * That is the difference between an instrument and a claim. A count of
		 * denials, on its own, cannot be told apart from a count taken while
		 * nothing was being enforced; a list that also shows the seal opening at
		 * 14:32 and a call reaching the internet at 14:33 is a log that tells on
		 * itself, and an evaluator can read it as evidence rather than as
		 * decoration.
		 */
		const EGRESS_EVENT_KINDS = {
			"egress/denied": "denied",
			"egress/permitted": "permitted",
			"egress/escaped": "escaped",
			"egress/seal": "seal",
		};
		const EGRESS_VIEW_TARGET = "bf-egress";
		const EGRESS_DEFINITION_KIND = "bf-egress";

		/** The seal's loopback channel, mirroring `CANARY_CHANNEL` below. */
		const SEAL_CHANNEL = "/bf-seal";

		/**
		 * View builder for {@link EGRESS_VIEW_TARGET}. Keeps one node per
		 * `egress/denied` event (keyed, so replay is idempotent) and reports
		 * `count` as the number of those nodes — derived by counting, not
		 * written down — alongside `entries`, the denials themselves in the
		 * order the log wrote them (Story 2.4), and the most recent one for the
		 * panel's summary line.
		 * @returns a `ConversationViewBuilder` — `{ empty, replace, apply }`.
		 */
		function createEgressViewBuilder() {
			/**
			 * @param nodes - the retained denial nodes.
			 * @returns `{ count, entries, latest }` — `entries` sorted by the
			 * log's own sequence number, so they read in the order they were
			 * written however they arrived; `count` is `entries.length`.
			 */
			function summarise(nodes) {
				const entries = nodes
					.map((node) => {
						const data = (node && node.data) || {};
						const anchorSeq = node && typeof node.anchorSeq === "number" ? node.anchorSeq : null;
						const seq = anchorSeq ?? (typeof data.seq === "number" ? data.seq : -1);
						return { ...data, seq };
					})
					.sort((a, b) => a.seq - b.seq);
				// `count` stays the number of DENIALS, not of entries: it is what the
				// chip has always shown and what FR15's counted zero means. The other
				// kinds are counted separately rather than folded into it, because a
				// single number that rose whether the seal stopped a call or waved it
				// through would be worse than no number at all.
				return {
					count: entries.filter((entry) => entry.kind === "denied").length,
					permitted: entries.filter((entry) => entry.kind === "permitted").length,
					escaped: entries.filter((entry) => entry.kind === "escaped" && entry.reached === true).length,
					entries,
					latest: entries.length > 0 ? entries[entries.length - 1] : null,
				};
			}
			let seen = new Map();
			function keyOf(node) {
				return node && (node.key ?? node.id);
			}
			return {
				empty: summarise([]),
				replace(input) {
					seen = new Map();
					for (const node of input.nodes) {
						const key = keyOf(node);
						if (key !== undefined && key !== null) seen.set(key, node);
					}
					return summarise([...seen.values()]);
				},
				apply(input) {
					for (const node of input.upserts) {
						const key = keyOf(node);
						if (key !== undefined && key !== null) seen.set(key, node);
					}
					return summarise([...seen.values()]);
				},
			};
		}

		/** The view Definition registered with `ctx.conversationViews`. */
		const egressViewDefinition = {
			target: EGRESS_VIEW_TARGET,
			create: createEgressViewBuilder,
		};

		/**
		 * The event Definition registered with `ctx.conversationEvents`: each
		 * `egress/denied` event is its own Context, keyed by its seq, carrying
		 * `{ tool, target }` as state.
		 */
		const egressNodeDefinition = {
			kind: EGRESS_DEFINITION_KIND,
			target: EGRESS_VIEW_TARGET,
			match(event) {
				return event && EGRESS_EVENT_KINDS[event.type] !== undefined
					? { id: String(event.seq), role: "start" }
					: null;
			},
			// Story 2.4 keeps the envelope's own `time` and `seq` alongside the
			// event's `{ tool, target }` data. `SessionEvent` carries both (unix
			// epoch milliseconds and the monotonic log sequence), so the audit
			// line on screen reads the timestamp the log recorded rather than a
			// second clock reading taken when the panel happened to render.
			start(_context, match) {
				const data = match.event.data || {};
				return {
					kind: EGRESS_EVENT_KINDS[match.event.type],
					tool: data.tool,
					target: data.target,
					// `egress/seal`: whether the seal ended up closed.
					// `egress/escaped`: whether the call actually arrived.
					sealed: data.sealed,
					reached: data.reached,
					detail: data.detail,
					time: typeof match.event.time === "number" ? match.event.time : null,
					seq: typeof match.event.seq === "number" ? match.event.seq : null,
				};
			},
			update(context) {
				return context.state;
			},
			buildViewNode(context) {
				if (context.state === undefined) return null;
				return {
					key: context.key,
					kind: EGRESS_DEFINITION_KIND,
					id: context.id,
					target: EGRESS_VIEW_TARGET,
					anchorSeq: context.start?.event?.seq ?? 0,
					data: context.state,
				};
			},
		};

		/**
		 * A tiny observable holding whether the full egress panel is open. The
		 * chip toggles it; the panel renders on it. Module-scoped so the two
		 * seats — which sit in different slot scopes and never share props —
		 * see the same value. Hand-rolled rather than pulled from
		 * `dsh-client-runtime/client` because a value import of that package
		 * from a plugin bundle inlines a second module instance (its README's
		 * documented boundary).
		 */
		function createOpenStore() {
			let open = false;
			const listeners = new Set();
			function emit() {
				for (const listener of listeners) listener();
			}
			return {
				get: () => open,
				set(next) {
					if (next === open) return;
					open = next;
					emit();
				},
				toggle() {
					open = !open;
					emit();
				},
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
			};
		}

		const egressPanelOpen = createOpenStore();

		/**
		 * The seal's state, as this client understands it, plus the only route
		 * this client has to change it.
		 *
		 * The seal itself lives on the host (`egress/seal.js`) — process-wide,
		 * closed at boot, never persisted open. This store is a cache of it,
		 * seeded by asking on mount so a reloaded page shows the truth rather
		 * than an assumption, and updated from what the host answers rather than
		 * from what the button hoped would happen. A control that moved its own
		 * indicator and then told the host would be able to show "sealed" while
		 * the machine was open, which is the one lie this panel must not be
		 * capable of.
		 *
		 * `known` stays false until the host has answered once. Until then the
		 * UI says it does not know yet, rather than assuming the safe answer and
		 * showing a reassurance it has not earned.
		 */
		function createSealStore() {
			let state = { sealed: true, known: false, busy: false };
			let connection = null;
			const listeners = new Set();
			function emit() {
				for (const listener of listeners) listener();
			}
			function set(next) {
				state = { ...state, ...next };
				emit();
			}
			async function call(endpoint, sessionId) {
				if (!connection) return;
				set({ busy: true });
				try {
					const result = await connection.rpc.call(SEAL_CHANNEL, endpoint, sessionId ? { sessionId } : {});
					if (result?.ok === true && typeof result.value?.sealed === "boolean") {
						set({ sealed: result.value.sealed, known: true, busy: false });
						return;
					}
					set({ busy: false });
				} catch (error) {
					console.warn(
						`@blind-flange/dsh-client-ui-base: the seal did not answer — ${error instanceof Error ? error.message : String(error)}`,
					);
					set({ busy: false });
				}
			}
			return {
				get: () => state,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				/** Point the store at the host transport, and read the seal once. */
				bind(next) {
					connection = next;
					void call("get");
				},
				/**
				 * Ask the host to open or close the seal.
				 * @param sealed - true to close it, false to open it.
				 * @param sessionId - the session to record the change on, when there is one.
				 */
				request(sealed, sessionId) {
					return call(sealed ? "close" : "open", sessionId);
				},
			};
		}

		const seal = createSealStore();

		/**
		 * The clock reading for one audit line, from the `time` the harness
		 * stamped on the denial event. Local wall time with seconds, because an
		 * evaluator reads it against the moment they pressed the canary. Renders
		 * an em dash rather than inventing a time when the record carries none.
		 * @param time - unix epoch milliseconds, or null.
		 */
		function denialClock(time) {
			if (typeof time !== "number" || !Number.isFinite(time)) return "—";
			return new Date(time).toLocaleTimeString();
		}

		/**
		 * The same instant as a full ISO 8601 stamp, for the audit line's
		 * `title` — the unambiguous form, next to the readable one.
		 * @param time - unix epoch milliseconds, or null.
		 */
		function denialStamp(time) {
			if (typeof time !== "number" || !Number.isFinite(time)) return "no timestamp recorded";
			return new Date(time).toISOString();
		}

		/**
		 * Read the folded egress snapshot for a session, or null when the view
		 * is not ready yet. `count` on a ready snapshot is the counted number
		 * of denial events — this function never invents one.
		 * @param session - a session face, or null.
		 */
		/**
		 * One audit entry, in the words an evaluator reads on screen.
		 *
		 * Plain sentences rather than event names: the person this list has to
		 * convince is a domain expert reading it once, over someone's shoulder,
		 * without a glossary. "Refused" and "Reached the internet" are readable
		 * from across a room; `egress/escaped { reached: true }` is not.
		 *
		 * A field the record does not carry is named as missing rather than
		 * filled in — an audit surface that invents a value is worse than one
		 * that admits a gap.
		 * @param entry - one folded entry from the `bf-egress` view.
		 * @returns `{ headline, detail }`, both plain text.
		 */
		function describeEntry(entry) {
			const tool = typeof entry.tool === "string" && entry.tool !== "" ? entry.tool : "an unrecorded tool";
			const target =
				typeof entry.target === "string" && entry.target !== "" ? entry.target : "an unrecorded target";
			switch (entry.kind) {
				case "seal":
					return entry.sealed === false
						? {
								headline: "Seal opened",
								detail: "Faraday stopped denying outbound calls. Recorded here because the operator did it.",
							}
						: { headline: "Seal closed", detail: "Outbound calls are denied again." };
				case "permitted":
					return {
						headline: "Permitted — the seal was open",
						detail: `${tool} was allowed to reach ${target}. Nothing in this application stood in its way.`,
					};
				case "escaped":
					return entry.reached === true
						? {
								headline: "Reached the internet",
								detail: `${target} answered. The seal was open and nothing else stopped this call.`,
							}
						: {
								headline: "Left the application — stopped outside it",
								detail: `${target} was attempted and nothing came back. ${
									typeof entry.detail === "string" && entry.detail !== "" ? entry.detail : "No response."
								} Whatever refused this was not Faraday.`,
							};
				default:
					return {
						headline: "Denied",
						detail: `${tool} tried to reach ${target}. Faraday denied it before it ran.`,
					};
			}
		}

		function readEgressSnapshot(session) {
			if (!session) return null;
			const view = session.getSnapshot().views.get(EGRESS_VIEW_TARGET);
			return view || null;
		}

		/**
		 * Build the compact egress chip for `conversation.session.header.utilities`.
		 * @param ctx - client root context, carrying `sessions`.
		 * @returns the component.
		 */
		function buildEgressChip(ctx) {
			const { useSyncExternalStore } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Pill, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			/**
			 * The chip: "Egress N", a green state dot at zero and a red one once
			 * anything has been denied (Story 2.3's red state). Clicking it opens
			 * the full panel. Reads the session's `bf-egress` view through
			 * `useSyncExternalStore`, so a fresh denial moves the number with no
			 * user action.
			 */
			function EgressChip(props) {
				const sealState = useSyncExternalStore(seal.subscribe, seal.get);
				const session = ctx.sessions?.binding?.(props.sessionId)?.session ?? null;
				const snapshot = useSyncExternalStore(
					(onChange) => (session ? session.subscribe(onChange) : () => {}),
					() => readEgressSnapshot(session),
				);
				const ready = snapshot !== null;
				const count = ready ? snapshot.count : null;
				const breached = ready && count > 0;

				return jsx(Pill, {
					active: breached || (sealState.known && !sealState.sealed),
					onClick: () => egressPanelOpen.toggle(),
					"aria-haspopup": "dialog",
					title:
						sealState.known && !sealState.sealed
							? "Egress monitor: the seal is OPEN — outbound calls are not being denied. Open for the audit detail and the control that closes it."
							: breached
								? `Egress monitor: ${count} outbound attempt${count === 1 ? "" : "s"} denied and recorded this session. Open for the audit detail.`
								: "Egress monitor: no outbound attempt has been made this session. The count is the number of recorded denials, not a fixed label.",
					children: jsxs("span", {
						style: { display: "inline-flex", alignItems: "center", gap: "6px" },
						children: [
							jsx(StateDot, {
								state: sealState.known && !sealState.sealed ? "warning" : breached ? "error" : "done",
								size: 8,
							}),
							// The chip stops showing a count while the seal is open. A
							// number that keeps reading "0" with enforcement switched off
							// would be the most misleading thing on the screen — true, and
							// understood as the opposite of what it means.
							sealState.known && !sealState.sealed ? "Egress — open" : ready ? `Egress ${count}` : "Egress",
						],
					}),
				});
			}

			return EgressChip;
		}

		/**
		 * Build the full egress panel for `shell.overlay`. Root-scoped, so it
		 * has no `sessionId` prop — it reads `ctx.sessions.list.current` and
		 * binds that session itself.
		 * @param ctx - client root context, carrying `sessions`.
		 * @returns the component.
		 */
		function buildEgressPanel(ctx) {
			const { useEffect, useRef, useState, useSyncExternalStore } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { StateDot, Button } = require("@deepseek-ai/dsh-client-ui-primitives");

			const SECONDARY = { color: "var(--dsw-alias-label-secondary)" };

			/** Current session id from the sessions list store, or null. */
			function useCurrentSessionId() {
				const list = ctx.sessions?.list ?? null;
				return useSyncExternalStore(
					(onChange) => (list ? list.subscribe(onChange) : () => {}),
					() => (list ? list.getSnapshot().current ?? null : null),
				);
			}

			/** The session face for the current session, or null. */
			function useCurrentSession() {
				const list = ctx.sessions?.list ?? null;
				const current = useSyncExternalStore(
					(onChange) => (list ? list.subscribe(onChange) : () => {}),
					() => (list ? list.getSnapshot().current ?? null : null),
				);
				return current ? ctx.sessions?.binding?.(current)?.session ?? null : null;
			}

			/**
			 * One audit line: the timestamp the log recorded, the tool that
			 * attempted the call, and the target it was refused. Two rows so a
			 * long target wraps under the clock rather than squeezing it, and
			 * `title` carries the ISO stamp and the whole sentence for a reader
			 * who wants the unambiguous form.
			 *
			 * A field the record does not carry is named as missing rather than
			 * filled in — an audit surface that invents a value is worse than
			 * one that admits a gap.
			 * @param entry - one folded `egress/denied` entry from the view.
			 * @returns the row, keyed by the event's log sequence number.
			 */
function auditLine(entry) {
				const line = describeEntry(entry);
				return jsxs(
					"div",
					{
						role: "listitem",
						title: `${denialStamp(entry.time)} — ${line.headline}. ${line.detail}`,
						style: { display: "flex", flexDirection: "column", gap: "2px" },
						children: [
							jsxs("div", {
								style: { display: "flex", alignItems: "baseline", gap: "8px" },
								children: [
									jsx("span", {
										style: { ...SECONDARY, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" },
										children: denialClock(entry.time),
									}),
									jsx("span", { style: { flex: "1 1 auto", minWidth: 0 }, children: line.headline }),
								],
							}),
							jsx("div", { style: { ...SECONDARY, wordBreak: "break-all" }, children: line.detail }),
						],
					},
					`bf-egress-line:${entry.seq}`,
				);
			}

			/**
			 * The seal control: a switch, labelled with the state it is in.
			 *
			 * WHY A SWITCH AND NOT A HOLD. It was a press-and-hold first, and the
			 * reasoning was sound on paper - resistance where the consequence is real,
			 * and a gesture the room can see being performed. In use it was neither.
			 * The hold had no pointer capture, so the smallest drag cancelled it and
			 * the operator could not tell whether the control or their hand had failed;
			 * its only feedback was a two-pixel bar at half opacity. A control whose
			 * failure mode is indistinguishable from a broken button is worse than a
			 * plain one, whatever it protects.
			 *
			 * And the protection was aimed at the wrong risk. What makes opening the
			 * seal safe is not that it is hard to press: it is that the seal is closed
			 * at boot and never persisted open, that opening is recorded on the session
			 * log, that a band across the window says so for as long as it lasts, and
			 * that every call it lets through is recorded too. None of that depends on
			 * the gesture. The gesture only ever cost legibility.
			 *
			 * On a projector this has to read at a glance and change in front of the
			 * room: deny the canary with the seal closed, throw the switch, fire it
			 * again and watch it reach the internet. The switch is the demo's whole
			 * argument that the zero beside it is counted rather than painted.
			 *
			 * `role="switch"` with `aria-checked`, operable by Space and Enter, so it
			 * is a real switch to a screen reader and not a div that happens to slide.
			 * Track, thumb and text take `ui-theme` tokens only - no colour of ours
			 * (UX-DR7).
			 *
			 * The sentence under it is not a warning label. It says what opening the
			 * seal does, that the act is recorded, and that a restart undoes it, at the
			 * one moment that information is relevant.
			 * @param props.sessionId - the session the change is recorded against.
			 */
			function SealControl(props) {
				const state = useSyncExternalStore(seal.subscribe, seal.get);
				const open = state.known && !state.sealed;
				const disabled = !state.known || state.busy;

				// One place, so the switch and its label can never disagree about which
				// way is which. `sealed` is the safe state, and it is the default.
				const toggle = () => {
					if (disabled) return;
					void seal.request(open, props.sessionId);
				};

				return jsxs("div", {
					style: { display: "flex", flexDirection: "column", gap: "6px" },
					children: [
						jsxs("div", {
							style: { display: "flex", alignItems: "center", gap: "8px" },
							children: [
								jsx("button", {
									type: "button",
									role: "switch",
									"aria-checked": open ? "true" : "false",
									"aria-label": "Network seal",
									disabled,
									onClick: toggle,
									onKeyDown: (event) => {
										// Space and Enter both throw a switch. Enter alone is what a
										// button gives you for free, and a switch that ignores Space is
										// the one keyboard complaint every audit makes.
										if (event.key === " " || event.key === "Enter") {
											event.preventDefault();
											toggle();
										}
									},
									title: open
										? "Close the seal. Faraday goes back to denying every outbound call."
										: "Open the seal. This workbench will be allowed to make real outbound calls, and each one is recorded.",
									style: {
										position: "relative",
										flex: "0 0 auto",
										width: "38px",
										height: "22px",
										padding: 0,
										borderRadius: "11px",
										border: "1px solid var(--dsw-alias-border-l2)",
										// The open state is the loud one, so it takes the foreground
										// colour as a fill. Closed is the quiet surface every other
										// control in this panel sits on.
										background: open ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-bg-layer-2)",
										cursor: disabled ? "default" : "pointer",
										opacity: disabled ? 0.5 : 1,
										transition: "background 120ms ease",
									},
									children: jsx("span", {
										"aria-hidden": "true",
										style: {
											position: "absolute",
											top: "2px",
											left: open ? "18px" : "2px",
											width: "16px",
											height: "16px",
											borderRadius: "50%",
											background: open ? "var(--dsw-alias-bg-layer-1)" : "var(--dsw-alias-label-secondary)",
											transition: "left 120ms ease",
										},
									}),
								}),
								jsx("span", {
									style: { fontWeight: 600 },
									children: open ? "Seal OPEN" : "Seal closed",
								}),
							],
						}),
						jsx("span", {
							style: { ...SECONDARY, fontSize: "0.9em" },
							children: open
								? "Every outbound call is now allowed to run, and each one is recorded above."
								: "Opening it lets this workbench make real outbound calls. The change is recorded here, and restarting the workbench closes it again.",
						}),
					],
				});
			}

			/**
			 * The panel: a small fixed card bottom-right of the overlay layer.
			 * Surface colours, border and shadow are `ui-theme` tokens; the
			 * state dot and buttons are primitives. Renders only while the chip
			 * has opened it.
			 *
			 * Story 2.4 makes this the audit surface: below the counted state it
			 * lists every recorded denial — timestamp, tool, refused target —
			 * oldest first, which is the order the log wrote them. The list is
			 * the `bf-egress` view's `entries`, folded from the same
			 * `egress/denied` events the count is folded from, so a fresh denial
			 * appears here through the standing `useSyncExternalStore`
			 * subscription with no restart and no reopening — and the list
			 * scrolls to keep that newest line in view once there are more of
			 * them than the capped box shows.
			 */
			function EgressPanel() {
				const open = useSyncExternalStore(egressPanelOpen.subscribe, egressPanelOpen.get);
				const sealState = useSyncExternalStore(seal.subscribe, seal.get);
				const sessionId = useCurrentSessionId();
				const session = useCurrentSession();
				const snapshot = useSyncExternalStore(
					(onChange) => (session ? session.subscribe(onChange) : () => {}),
					() => readEgressSnapshot(session),
				);

				const ready = snapshot !== null;
				const count = ready ? snapshot.count : null;
				const breached = ready && count > 0;
				const entries = ready && Array.isArray(snapshot.entries) ? snapshot.entries : [];
				// Calls that actually reached the internet this session. Counted
				// separately from denials and stated separately below, because
				// re-closing the seal does not un-send them: once something has got
				// out, the session carries that fact whatever the seal does next.
				const escaped = ready && typeof snapshot.escaped === "number" ? snapshot.escaped : 0;

				// Keep the newest denial in view. The list reads oldest-first —
				// the order the log wrote them, which is what this story asks for —
				// so a fresh line lands at the bottom, and past the third it lands
				// below the fold of the capped box. An evaluator pressing the canary
				// while watching this panel would stop seeing the line their own
				// press produced, so every new entry scrolls the box to the end.
				// Declared above the `open` early return: hook order has to be the
				// same on the render that draws the panel and the one that hides it.
				const listRef = useRef(null);
				useEffect(() => {
					const node = listRef.current;
					if (node) node.scrollTop = node.scrollHeight;
				}, [entries.length]);

				if (!open) return null;

				// Two facts, stated separately because they are independent: whether
				// enforcement is on, and what it has stopped. Folding them into one
				// sentence hid the count for as long as the seal's state was still
				// being read, and a count that disappears is worse than one that waits.
				const sealLine = !sealState.known
					? "Checking whether the seal is closed."
					: sealState.sealed
						? "Sealed. Outbound calls are denied before they run."
						: "The seal is OPEN. Outbound calls are not being denied by Faraday.";
				const body = !ready
					? jsx("span", { style: SECONDARY, children: "Waiting for a session." })
					: jsxs("div", {
							style: { display: "flex", flexDirection: "column", gap: "4px" },
							children: [
								jsx("span", { style: SECONDARY, children: sealLine }),
								escaped > 0
									? jsx("span", {
											style: SECONDARY,
											children: `${escaped} call${escaped === 1 ? "" : "s"} reached the internet in this session. Closing the seal does not undo that.`,
										})
									: null,
								jsx("span", {
									style: SECONDARY,
									children: breached
										? `${count} outbound attempt${count === 1 ? "" : "s"} denied and written to the session log.`
										: "No outbound attempt has been made. This zero is counted from the denial log, not printed.",
								}),
							],
						});

				// `ui-theme` exposes colour, shadow and font tokens but no radius
				// or spacing scale — every shipped primitive hard-codes those in
				// px (Pill, HoverCard and Toast all use `border-radius: 12px`).
				// So the surface's colours, border and shadow are `--dsw-*`
				// tokens, and the radius/padding/gap match the shipped `Pill`'s
				// own values rather than inventing a look. Same pattern as the
				// inline `gap` on the provider and routing chips above.
				return jsx("section", {
					"aria-label": "Egress monitor",
					style: {
						position: "absolute",
						right: "16px",
						// Anchored below the session header, not above the composer.
						// Story 2.2 sat this card bottom-right, which was fine while it
						// was three lines tall; Story 2.4's audit list makes it tall
						// enough to cover the canary button in the composer row — the
						// one control an evaluator presses *while* watching this panel.
						// The header is fixed chrome (measured 76px at default density,
						// 28 Aug 2026) where the chip that opens this panel also lives,
						// so opening beneath that chip both clears the composer and
						// reads as the chip's own surface. The list's `maxHeight` below
						// keeps the card from growing back down into the composer.
						top: "88px",
						width: "320px",
						padding: "12px 14px",
						display: "flex",
						flexDirection: "column",
						gap: "8px",
						borderRadius: "12px",
						background: "var(--dsw-alias-bg-layer-1)",
						border: "1px solid var(--dsw-alias-border-l2)",
						boxShadow: "var(--dsw-shadow-lv2)",
						color: "var(--dsw-alias-label-primary)",
					},
					children: [
						jsxs("div", {
							style: { display: "flex", alignItems: "center", gap: "8px" },
							children: [
								// Three readings, not two. "Sealed and nothing refused" is
								// the resting state; "sealed and something was refused" is
								// the seal doing its job; "open" is neither, and it must not
								// borrow the colour of either.
								jsx(StateDot, {
									state: sealState.known && !sealState.sealed ? "warning" : breached ? "error" : "done",
									size: 10,
								}),
								jsx("strong", { style: { flex: "1 1 auto" }, children: "Egress monitor" }),
								jsx("span", {
									style: { ...SECONDARY, fontVariantNumeric: "tabular-nums" },
									children: ready ? String(count) : "—",
								}),
							],
						}),
						body,
						jsx("div", {
							"aria-hidden": "true",
							style: { height: "1px", background: "var(--dsw-alias-border-l2)" },
						}),
						jsx(SealControl, { sessionId }),
						entries.length > 0
							? jsx("div", {
									"aria-hidden": "true",
									style: { height: "1px", background: "var(--dsw-alias-border-l2)" },
								})
							: null,
						entries.length > 0 ? jsx("div", { style: SECONDARY, children: "Audit log — oldest first" }) : null,
						entries.length > 0
							? jsx("div", {
									role: "list",
									"aria-label": "Audit log — denied outbound attempts",
									ref: listRef,
									style: {
										display: "flex",
										flexDirection: "column",
										gap: "8px",
										maxHeight: "168px",
										overflowY: "auto",
									},
									children: entries.map((entry) => auditLine(entry)),
								})
							: null,
						jsx("div", {
							style: { display: "flex", justifyContent: "flex-end" },
							children: jsx(Button, {
								variant: "ghost",
								size: "sm",
								onClick: () => egressPanelOpen.set(false),
								children: "Dismiss",
							}),
						}),
					],
				});
			}

			return EgressPanel;
		}

		/**
		 * The open-seal band.
		 *
		 * WHY A BAND AND NOT A RED CHIP. A control that changes only itself is
		 * not telling the truth about what it did — the consequence has to be
		 * visible in the same frame as the cause. So the seal's open state is
		 * not a colour somewhere in the header: it takes space at the top of the
		 * window and keeps it. The application looks different because it *is*
		 * different, and there is no reading of the screen in which an open seal
		 * goes unnoticed.
		 *
		 * It cannot be dismissed. A dismissable warning is a warning that will
		 * be dismissed, and the state it describes is the one state nobody
		 * should be able to forget they are in.
		 *
		 * Its weight comes from occupying the layout, not from shouting: the
		 * surface, border and shadow are the same `ui-theme` tokens every other
		 * panel uses, and the only colour is `StateDot`'s own. This is
		 * industrial control software (UX-DR7); a stripe of hand-mixed red would
		 * read as pasted on, which is the failure this project has already made
		 * once and written a rule about.
		 *
		 * Closed by the same call the panel's control uses, so the band is a
		 * second way to reach one action rather than a second mechanism.
		 * @param ctx - client root context, carrying `sessions`.
		 * @returns the component.
		 */
		function buildSealBand(ctx) {
			const { useSyncExternalStore } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { StateDot, Button } = require("@deepseek-ai/dsh-client-ui-primitives");

			function SealBand() {
				const state = useSyncExternalStore(seal.subscribe, seal.get);
				const list = ctx.sessions?.list ?? null;
				const sessionId = useSyncExternalStore(
					(onChange) => (list ? list.subscribe(onChange) : () => {}),
					() => (list ? list.getSnapshot().current ?? null : null),
				);

				// Silent unless it has something true to say. Until the host has
				// answered once, this client does not know the seal's state and must
				// not imply either answer.
				if (!state.known || state.sealed) return null;

				return jsx("div", {
					style: {
						position: "absolute",
						top: "12px",
						left: "0",
						right: "0",
						display: "flex",
						justifyContent: "center",
						pointerEvents: "none",
					},
					children: jsxs("section", {
						role: "status",
						"aria-label": "The egress seal is open",
						style: {
							pointerEvents: "auto",
							display: "flex",
							alignItems: "center",
							gap: "10px",
							maxWidth: "min(680px, calc(100% - 32px))",
							padding: "8px 10px 8px 14px",
							borderRadius: "12px",
							background: "var(--dsw-alias-bg-layer-1)",
							border: "1px solid var(--dsw-alias-border-l2)",
							boxShadow: "var(--dsw-shadow-lv2)",
							color: "var(--dsw-alias-label-primary)",
						},
						children: [
							jsx(StateDot, { state: "warning", size: 10 }),
							jsxs("span", {
								style: { flex: "1 1 auto" },
								children: [
									jsx("strong", { children: "The egress seal is open." }),
									" Outbound calls are not being blocked by Faraday.",
								],
							}),
							jsx(Button, {
								variant: "ghost",
								size: "sm",
								disabled: state.busy,
								onClick: () => void seal.request(true, sessionId),
								children: "Close the seal",
							}),
						],
					}),
				});
			}

			return SealBand;
		}

		/* ---------------------------------------------------------------------
		 * Canary (Story 2.3)
		 *
		 * CONTEXT.md: the button that fires a deliberate outbound network call so
		 * the user can watch egress denial block it, the monitor turn red, and the
		 * audit log record it. Silence proves nothing; the canary is what turns an
		 * absence into evidence.
		 *
		 * It takes `conversation.input.right` (list, session) — the composer tool
		 * row, before the send button — and posts to the host's loopback
		 * `/bf-canary` channel. The host dispatches the real canary tool through
		 * `ctx.tools.execute`, the egress denial waterfall refuses it and appends
		 * the `egress/denied` event, and the monitor above re-reads that event
		 * through the same `bf-egress` view it always reads. Nothing here touches
		 * the count: this button has no path to the number it makes move, which is
		 * what keeps the panel driven by a real event (NFR8).
		 * ------------------------------------------------------------------- */

		/* ---------------------------------------------------------------------
		 * Upload (30 August 2026)
		 *
		 * Story 8.2 established that the harness already ships an `@` mention
		 * picker and that nothing needed installing for it. That is still true, and
		 * attaching by naming a path is still a real feature. It is just not the
		 * same thing as a judge watching a file *arrive* — which is the thirty
		 * seconds this product has to earn — so this adds the arrival beside the
		 * mention rather than replacing it.
		 *
		 * Same seat and same shape as the canary below it: `conversation.input.right`
		 * (list, session), a `Pill`, and one loopback RPC channel. Nothing here sets
		 * a colour; `Pill` and `StateDot` carry the whole look through the theme's
		 * own tokens, which is what keeps it looking like it shipped with the
		 * harness in both light and dark.
		 *
		 * The file is read in the browser and posted as base64. The host attaches
		 * it and OCRs it immediately, then answers with the finding count and the
		 * time it took — a number the user can sanity-check, rather than a tick.
		 * ------------------------------------------------------------------- */

		/* ---------------------------------------------------------------------
		 * Residency (30 August 2026)
		 *
		 * CONTEXT.md "Residency": which fleet members are resident in VRAM at a
		 * given moment, and how long they stay before eviction.
		 *
		 * The spec asked for an execution-trace surface. Most of what one would show
		 * already has a home — the routing chip carries every classifier score and
		 * exclusion reason, and the approval note carries the model, the OCR
		 * provenance and the tool sequence in a form that survives the file being
		 * emailed. Repeating those here would be work spent making the same fact
		 * visible in a fourth place.
		 *
		 * One thing is genuinely invisible: which models are in 4 GB of VRAM right
		 * now, and what was evicted to make room. That is the hardest constraint on
		 * this build, and it is the difference between a chip that changes a label
		 * and a machine visibly managing a card too small for its fleet. So this
		 * shows residency, with the turn's trace as the detail underneath.
		 *
		 * Read from llama-swap's own `/running` through the host. We do not own
		 * loading or eviction, so a panel with its own idea of what is loaded would
		 * be a second source of truth that can disagree with the thing actually
		 * holding the memory — the same reasoning that keeps the egress monitor
		 * counting events rather than a counter.
		 * ------------------------------------------------------------------- */

		const TRACE_CHANNEL = "/bf-trace";
		const TRACE_ENDPOINT = "read";

		/**
		 * Build the residency chip for `conversation.session.header.utilities`.
		 * @param connection - the host transport (`ctx.connection`), carrying `rpc.call`.
		 */
		function buildResidencyChip(connection) {
			// Deliberately only the hooks the rest of this file already uses. An
			// earlier version reached for `useCallback`, which the browser has and
			// this package's own test seam does not model — so the chip threw in test
			// and rendered fine in the app, which is the worst way round.
			const { useEffect, useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Menu, Pill, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			function ResidencyChip() {
				const [trace, setTrace] = useState(null);
				const [open, setOpen] = useState(false);

				useEffect(() => {
					let live = true;
					async function read() {
						try {
							const result = await connection.rpc.call(TRACE_CHANNEL, TRACE_ENDPOINT, {});
							// Guard against a resolve arriving after unmount, which would
							// otherwise be a setState on a dead component every time a
							// session is closed mid-poll.
							if (live) setTrace(result?.ok === true ? result.value : null);
						} catch {
							// A chip that throws is worse than one that says nothing.
							if (live) setTrace(null);
						}
					}
					read();
					// Polled rather than pushed. llama-swap has an SSE event stream its own
					// UI consumes, and using it would mean a second transport for one chip;
					// a swap takes about three seconds, so two-second polling shows it
					// happening without pretending to be live.
					const timer = setInterval(read, 2000);
					return () => {
						live = false;
						clearInterval(timer);
					};
				}, []);

				const residency = Array.isArray(trace?.residency) ? trace.residency : [];
				// llama-swap answers with both a runtime id (`bf-coder`) and the display
				// name the config gives it (`Coder`). The id is an internal key: it is what
				// `registry/models.yaml`'s `runtime_id` has to match and what dispatch sends,
				// and it means nothing to anyone reading the header. Prefer the name and keep
				// the id for the expanded rows, where a reader chasing the config wants it.
				const shown = (entry) => entry.name || entry.model;
				const ready = residency.filter((entry) => entry.state === "ready");
				const loading = residency.filter((entry) => entry.state === "starting" || entry.state === "stopping");

				// Four states, and each says something different about the machine.
				let tone = "neutral";
				let label = "VRAM idle";
				let title = "No model is resident in the GPU. One will load on the next question.";
				if (trace === null || trace.runtimeReachable === false) {
					tone = "danger";
					label = "VRAM —";
					title =
						"llama-swap is not answering, so nothing can be loaded. Start it, or switch the model plane to `replay` " +
						"in the profile patch.";
				} else if (loading.length > 0) {
					tone = "info";
					label = `Loading ${shown(loading[0])}`;
					title = `Swapping models: ${loading.map((entry) => `${shown(entry)} is ${entry.state}`).join(", ")}. On this card only one fits at a time.`;
				} else if (ready.length > 0) {
					tone = "success";
					label = `VRAM ${ready.map(shown).join(", ")}`;
					title = `Resident in GPU memory: ${ready.map(shown).join(", ")}. Read from llama-swap, not tracked by Faraday.`;
				}

				const items = [];
				items.push({ kind: "label", text: "Resident in GPU memory" });
				if (residency.length === 0) {
					items.push({ kind: "text", text: trace?.runtimeReachable === false ? "llama-swap is not answering." : "Nothing loaded." });
				} else {
					for (const entry of residency) {
						items.push({
							kind: "text",
							text: `${shown(entry)} (${entry.model}) — ${entry.state}${typeof entry.ttl === "number" && entry.ttl > 0 ? `, unloads after ${entry.ttl}s idle` : ""}`,
						});
					}
				}
				items.push({ kind: "label", text: "This turn" });
				items.push({ kind: "text", text: `Model plane: ${trace?.providerName ?? "unknown"}` });
				items.push({
					kind: "text",
					text:
						trace?.taskType === null || trace?.taskType === undefined
							? "Nothing routed yet."
							: `Routed as ${trace.taskType} → ${trace.selected ?? "no member"}${trace.runtimeId ? ` (${trace.runtimeId})` : ""}`,
				});
				if (trace?.dispatchReason && trace.dispatchReason !== "routed") {
					// A fallback to the default model looks exactly like a routing
					// decision unless the reason is said out loud.
					items.push({ kind: "text", text: `Not dispatched: ${trace.dispatchReason}` });
				}
				if (trace?.ingestion) {
					items.push({
						kind: "text",
						text:
							trace.ingestion.source === "live"
								? `Read ${trace.ingestion.findings ?? "?"} OCR lines from ${trace.ingestion.report ?? "the document"} on this machine`
								: `Read ${trace.ingestion.findings ?? "?"} OCR lines from the committed capture, not a live OCR pass`,
					});
				}
				for (const [index, tool] of (Array.isArray(trace?.tools) ? trace.tools : []).entries()) {
					items.push({ kind: "text", text: `${index + 1}. ${tool.name}${tool.outcome ? ` — ${tool.outcome}` : ""}` });
				}

				const anchor = jsxs(Pill, {
					as: "button",
					type: "button",
					onClick: () => setOpen((was) => !was),
					title,
					"aria-label": title,
					children: [jsx(StateDot, { tone }), label],
				});

				return jsx(Menu, {
					open,
					onOpenChange: setOpen,
					side: "bottom",
					// Right-aligned and portalled, like the routing chip. This chip is the
					// last seat in the session header, so a menu aligned to its left edge
					// opens rightwards into nothing: measured 30 August 2026 at 255px wide
					// from x=1170 in a 1283px window, which put 141px of it past the edge of
					// the screen with no way to scroll to it. `end` hangs it from the chip's
					// right edge instead, so it grows back across the header where there is
					// room. The portal keeps it out of the header's own overflow.
					align: "end",
					portal: true,
					anchor,
					items: items.map((item, index) =>
						item.kind === "label"
							? { id: `l${index}`, type: "label", label: item.text }
							: { id: `t${index}`, type: "item", label: item.text, disabled: true },
					),
				});
			}

			return ResidencyChip;
		}

		const UPLOAD_CHANNEL = "/bf-upload";
		const UPLOAD_ENDPOINT = "attach";
		const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp";

		/**
		 * Build the upload control for `conversation.input.right`.
		 * @param connection - the host transport (`ctx.connection`), carrying `rpc.call`.
		 * @returns the component.
		 */
		function buildUploadButton(connection) {
			const { useRef, useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Pill, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			/** Read a File as base64 without loading a second copy as a string first. */
			function readAsBase64(file) {
				return new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onerror = () => reject(reader.error ?? new Error("the file could not be read"));
					reader.onload = () => {
						// A data URL is `data:<type>;base64,<payload>`; we want the payload.
						const text = String(reader.result ?? "");
						const comma = text.indexOf(",");
						resolve(comma === -1 ? "" : text.slice(comma + 1));
					};
					reader.readAsDataURL(file);
				});
			}

			function UploadButton() {
				// idle -> reading -> ingesting -> ready | failed
				const [phase, setPhase] = useState("idle");
				const [detail, setDetail] = useState("");
				const inputRef = useRef(null);

				async function onPicked(event) {
					const file = event.target?.files?.[0];
					// Reset the input so picking the same file twice still fires a change.
					if (event.target) event.target.value = "";
					if (!file) return;

					setPhase("reading");
					setDetail(file.name);
					let base64;
					try {
						base64 = await readAsBase64(file);
					} catch (error) {
						setPhase("failed");
						setDetail(error instanceof Error ? error.message : String(error));
						return;
					}

					// The OCR pass is several seconds of real work. Saying which stage we
					// are in matters more here than anywhere else in the UI: a spinner
					// that means "reading a 3 MB file" and one that means "running OCR on
					// two pages" have very different expected durations, and a judge
					// watching an undifferentiated spinner assumes the second is a hang.
					setPhase("ingesting");
					try {
						const result = await connection.rpc.call(UPLOAD_CHANNEL, UPLOAD_ENDPOINT, { filename: file.name, base64 });
						if (result?.ok !== true) {
							setPhase("failed");
							setDetail(result?.error?.message ?? "the host refused the upload");
							return;
						}
						const value = result.value ?? {};
						setPhase("ready");
						setDetail(
							`${value.filename}: ${value.findings} findings across ${value.pages} page(s), read in ${Number(value.seconds ?? 0).toFixed(1)}s`,
						);
					} catch (error) {
						setPhase("failed");
						setDetail(error instanceof Error ? error.message : String(error));
					}
				}

				const busy = phase === "reading" || phase === "ingesting";
				const LABEL = {
					idle: "Upload a document",
					reading: "Reading…",
					ingesting: "Running OCR…",
					ready: "Document read",
					failed: "Upload failed",
				};
				const TONE = { idle: "neutral", reading: "info", ingesting: "info", ready: "success", failed: "danger" };
				const TITLE = {
					idle: "Attach a scanned PDF or image. It is read on this machine by the local OCR service — nothing leaves the box.",
					reading: `Reading ${detail} in the browser.`,
					ingesting: `Running local OCR over ${detail}. Nothing leaves this machine.`,
					ready: detail,
					failed: detail,
				};

				return jsxs(Pill, {
					as: "button",
					type: "button",
					onClick: () => {
						if (!busy) inputRef.current?.click();
					},
					disabled: busy,
					title: TITLE[phase],
					"aria-label": LABEL[phase],
					"aria-busy": busy ? "true" : undefined,
					children: [
						jsx(StateDot, { tone: TONE[phase] }),
						LABEL[phase],
						// Kept in the tree rather than created on demand, so the click
						// handler above always has something to open. Hidden from
						// assistive technology because the Pill is the control.
						jsx("input", {
							ref: inputRef,
							type: "file",
							accept: UPLOAD_ACCEPT,
							onChange: onPicked,
							style: { display: "none" },
							tabIndex: -1,
							"aria-hidden": "true",
						}),
					],
				});
			}

			return UploadButton;
		}

		const CANARY_CHANNEL = "/bf-canary";
		const CANARY_ENDPOINT = "fire";

		/**
		 * Build the canary button for `conversation.input.right`.
		 * @param connection - the host transport (`ctx.connection`), carrying `rpc.call`.
		 * @returns the component.
		 */
		function buildCanaryButton(connection) {
			const { useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Pill, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			/**
			 * Five outcomes, and the button says which one it is rather than
			 * looking the same after every press.
			 *
			 * `refused` and `stoppedOutside` are both good news and both red, but
			 * they are emphatically not the same fact, and the button must never
			 * report one as the other: in the first, Faraday stopped the call
			 * and wrote the record; in the second the call genuinely left this
			 * process and something outside it — a host firewall, an unplugged
			 * cable — refused it, and we can claim no credit and no record. The
			 * old code collapsed the two, which would have had this button assert
			 * a denial and an audit entry that the counter beside it could not
			 * corroborate. See `createCanaryRpcHandler`.
			 *
			 * `reached` is amber, because a canary that got out is the one result
			 * nobody should be able to miss — and, when the operator opened the
			 * seal deliberately, the one that proves this button is measuring
			 * something rather than asserting it.
			 */
			const COPY = {
				idle: "Fire the canary: attempt a real outbound connection and watch what happens to it.",
				firing: "Firing the canary — attempting an outbound connection.",
				refused: "Denied by Faraday before the call ran, and written to the audit log.",
				stoppedOutside:
					"The call left Faraday and nothing came back within three seconds. Whatever refused it was outside this application — Faraday did not.",
				reached: "The call REACHED the internet. The seal was open and nothing stopped it.",
				failed: "The canary could not be fired. The host did not answer.",
			};

			/** Server outcome name to button phase. Anything unrecognised is a failure to report, not a result to invent. */
			const PHASE_FOR = {
				refused: "refused",
				"stopped-outside": "stoppedOutside",
				reached: "reached",
			};

			/**
			 * The composer-row control. A `Pill`, like the routing chip beside it
			 * and the egress chip in the session header: `Button`'s `toolbar`
			 * variant looked right in dark and resolved to a translucent dark fill
			 * under near-black text in light, which is the "pasted on" failure the
			 * UI rules exist to prevent (UX-DR2). Nothing here sets a colour —
			 * `Pill` and `StateDot` carry the whole look through `--dsw-*` tokens.
			 */
			function CanaryButton(props) {
				const [phase, setPhase] = useState("idle");

				async function fire() {
					if (phase === "firing") return;
					setPhase("firing");
					try {
						const result = await connection.rpc.call(CANARY_CHANNEL, CANARY_ENDPOINT, {
							sessionId: props.sessionId,
						});
						if (result?.ok !== true) {
							setPhase("failed");
							return;
						}
						const next = PHASE_FOR[result.value?.outcome];
						setPhase(next ?? "failed");
						// The alarm brings up the instrument. A call that got out is the
						// loudest thing this system can say about itself, and it should
						// not depend on the panel already happening to be open.
						if (next === "reached") egressPanelOpen.set(true);
					} catch (error) {
						console.warn(
							`@blind-flange/dsh-client-ui-base: the canary could not be fired — ${error instanceof Error ? error.message : String(error)}`,
						);
						setPhase("failed");
					}
				}

				const dot =
					phase === "firing"
						? "ongoing"
						: phase === "refused" || phase === "stoppedOutside"
							? "error"
							: phase === "reached" || phase === "failed"
								? "warning"
								: null;

				return jsx(Pill, {
					active: dot !== null,
					disabled: phase === "firing",
					onClick: fire,
					title: COPY[phase],
					"aria-label": COPY[phase],
					children: jsxs("span", {
						style: { display: "inline-flex", alignItems: "center", gap: "6px" },
						// The label stays the control's name; the dot and the tooltip
						// carry the state, and the audit list carries the sentence. The
						// one exception is the call that got out: that outcome is named
						// on the button itself, because it is the only one that must be
						// legible from the back of the room without hovering anything.
						children: [
							dot === null ? null : jsx(StateDot, { state: dot, size: 8 }),
							phase === "reached" ? "Canary — got out" : "Canary",
						],
					}),
				});
			}

			return CanaryButton;
		}

		/**
		 * Hold the tab title against the harness, which rewrites it after hydration.
		 *
		 * `@deepseek-ai/dsh-client-ui-renderer` renders a `DocumentTitle` component
		 * beside `renderSlot("root")` with a hard-coded `const productTitle =
		 * "DeepSeek Harness"`, and sets `document.title` from a `useEffect`. The
		 * host-side `tapIndex` swap in `index.js` wins the first paint and loses to
		 * that effect, so the tab read "DeepSeek Harness" from hydration onward.
		 *
		 * There is no row to disable — `DocumentTitle` is rendered directly, not
		 * registered into a slot — and no config key to override, so the only
		 * out-of-tree fix is to watch the title node and put ours back. Editing
		 * harness source is forbidden (NFR5).
		 *
		 * The harness writes either `productTitle` alone or `${sessionTitle} — ${productTitle}`,
		 * so the session title is preserved and only the product half is replaced.
		 * @returns a dispose function that stops observing.
		 */
		function holdTabTitle() {
			const HOST_PRODUCT_TITLE = "DeepSeek Harness";
			const OUR_PRODUCT_TITLE = "Faraday";

			function correct() {
				const current = document.title;
				if (!current.includes(HOST_PRODUCT_TITLE)) return;
				const corrected = current.split(HOST_PRODUCT_TITLE).join(OUR_PRODUCT_TITLE);
				if (corrected !== current) document.title = corrected;
			}

			correct();

			const titleElement = document.querySelector("title");
			if (titleElement === null || typeof MutationObserver !== "function") {
				console.warn(
					"@blind-flange/dsh-client-ui-base: no <title> element or no MutationObserver — the tab title will revert to the harness's once the client renders",
				);
				return () => {};
			}

			// childList catches the text node swap React makes; characterData with
			// subtree catches an in-place edit of the existing text node.
			const observer = new MutationObserver(correct);
			observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
			return () => {
				observer.disconnect();
			};
		}

		/* ---------------------------------------------------------------------
		 * Provenance crop viewer (Story 4.5)
		 *
		 * CONTEXT.md: a provenance crop is "the image region a cited fact was
		 * actually read from, shown next to the claim. Provenance here always
		 * means page *and* region, never just a filename." This panel is where
		 * an evaluator checks that claim for themselves: every OCR finding the
		 * ingestion service returned for the sample inspection report is listed,
		 * and clicking one shows the patch of the scanned page its bounding box
		 * covers, beside the text the engine read there.
		 *
		 * It takes `conversation.view` (list, session) — a whole tab beside Chat
		 * and Trajectory, which is the seat `docs/deepseek-harness-notes.md`
		 * proposes for provenance crops and the one this story's acceptance
		 * criteria name.
		 *
		 * **The crop is generated here, in the browser, from the real page
		 * image.** The host serves the full 300 dpi page PNG
		 * (`findings/provenance.js`); this clips a box the size of the finding's
		 * bounding box over it and offsets the page inside that box by the
		 * box's own top-left. There is no pre-cut crop image in this package and
		 * nothing draws a rectangle from remembered numbers: move a bounding box
		 * in the capture and the pixels on screen move with it. If the OCR
		 * slips, the crop slips (Story 4.2's own acceptance criteria, NFR8).
		 * ------------------------------------------------------------------- */

		const PROVENANCE_VIEW_ID = "bf-provenance";
		const PROVENANCE_FINDINGS_URL = "/blind-flange/provenance/findings";

		/** The box a crop is fitted into, in CSS pixels. */
		const CROP_BOX = { width: 560, height: 200 };
		/** Never magnify past this: a single OCR line blown up is mush, not evidence. */
		const CROP_MAX_SCALE = 3;
		/** Width of the whole-page locator beside the crop, in CSS pixels. */
		const LOCATOR_WIDTH = 132;

		/**
		 * Where the host serves one page of the report as its real PNG.
		 * @param page - 1-indexed page number, as recorded on the finding.
		 */
		function pageImageUrl(page) {
			return `/blind-flange/provenance/pages/${page}`;
		}

		/** A CSS pixel length, rounded to hundredths so a style string is stable. */
		function px(value) {
			return `${Math.round(value * 100) / 100}px`;
		}

		/**
		 * Everything needed to show one finding's region: a clipping box the
		 * size of the bounding box, and the offset that brings that region of
		 * the full page underneath it.
		 *
		 * `scale` fits the bounding box inside {@link CROP_BOX} — small lines are
		 * magnified up to {@link CROP_MAX_SCALE}, a full-width banner is reduced
		 * until it fits. The page image is then rendered at that same scale and
		 * pushed left and up by the box's own origin, so exactly the recorded
		 * region lands inside the clip and nothing else does.
		 * @param bbox - the finding's `{ left, top, width, height }` in source-image pixels.
		 * @param page - the page manifest entry, carrying the page's real pixel size.
		 * @returns the geometry, or `null` when either rectangle is unusable.
		 */
		function cropGeometry(bbox, page) {
			const usable = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
			if (!bbox || !usable(bbox.width) || !usable(bbox.height)) return null;
			if (!page || !usable(page.width) || !usable(page.height)) return null;
			const scale = Math.min(CROP_BOX.width / bbox.width, CROP_BOX.height / bbox.height, CROP_MAX_SCALE);
			return {
				scale,
				width: bbox.width * scale,
				height: bbox.height * scale,
				imageWidth: page.width * scale,
				imageHeight: page.height * scale,
				left: -bbox.left * scale,
				top: -bbox.top * scale,
			};
		}

		/**
		 * The same region expressed on a whole-page thumbnail, so the crop is
		 * placed on the page rather than floating free. Derived from the one
		 * bounding box the crop uses, at the thumbnail's own scale.
		 * @param bbox - the finding's bounding box.
		 * @param page - the page manifest entry.
		 */
		function locatorGeometry(bbox, page) {
			const usable = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
			if (!bbox || !page || !usable(page.width) || !usable(page.height)) return null;
			const scale = LOCATOR_WIDTH / page.width;
			return {
				scale,
				width: LOCATOR_WIDTH,
				height: page.height * scale,
				markLeft: bbox.left * scale,
				markTop: bbox.top * scale,
				markWidth: Math.max(bbox.width * scale, 2),
				markHeight: Math.max(bbox.height * scale, 2),
			};
		}

		/**
		 * Build the crop viewer for `conversation.view`.
		 *
		 * The findings and the page manifest are loaded once per mount from the
		 * host's provenance route — the same capture the `bf_report_findings`
		 * tool reads, so the panel and the agent cite one set of numbers. The
		 * page manifest carries each page's real pixel size, read from the PNG
		 * itself on the host, which is what the geometry above scales in.
		 * @returns the component.
		 */
		function buildProvenanceView() {
			const { useEffect, useState } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { Button, StateDot } = require("@deepseek-ai/dsh-client-ui-primitives");

			const SECONDARY = { color: "var(--dsw-alias-label-secondary)" };

			/**
			 * Load the ingested report's findings and page manifest.
			 * @returns `{ status: "loading" | "ready" | "error", payload?, message? }`.
			 */
			function useProvenance() {
				const [state, setState] = useState({ status: "loading" });
				useEffect(() => {
					let live = true;
					fetch(PROVENANCE_FINDINGS_URL, { headers: { accept: "application/json" } })
						.then((response) => {
							if (!response.ok) throw new Error(`the findings route answered ${response.status}`);
							return response.json();
						})
						.then((payload) => {
							if (live) setState({ status: "ready", payload });
						})
						.catch((error) => {
							if (live) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
						});
					return () => {
						live = false;
					};
				}, []);
				return state;
			}

			/** OCR confidence as a percentage, or an em dash when the record has none. */
			function confidenceText(confidence) {
				return typeof confidence === "number" && Number.isFinite(confidence) ? `${confidence.toFixed(1)}%` : "—";
			}

			/**
			 * One row of the findings list: the page it was read from, the text
			 * the engine read, and its confidence. A `Button` primitive, so the
			 * row is keyboard-reachable and carries the shipped focus ring; only
			 * layout and `--dsw-*` tokens are set here.
			 * @param finding - one entry of the capture.
			 * @param index - its position, used as the selection key.
			 * @param selected - whether it is the finding on show.
			 * @param onSelect - selects this finding.
			 */
			function findingRow(finding, index, selected, onSelect) {
				const text = typeof finding.text === "string" && finding.text !== "" ? finding.text : "(no text read)";
				return jsx(
					Button,
					{
						variant: selected ? "outline" : "ghost",
						size: "sm",
						onClick: () => onSelect(index),
						"aria-pressed": selected,
						title: `Page ${finding.page} · ${text}`,
						style: { width: "100%", justifyContent: "flex-start", textAlign: "left" },
						children: jsxs("span", {
							style: { display: "flex", alignItems: "baseline", gap: "8px", width: "100%", minWidth: 0 },
							children: [
								jsx("span", {
									style: { ...SECONDARY, flex: "0 0 auto", fontVariantNumeric: "tabular-nums" },
									children: `p${finding.page}`,
								}),
								jsx("span", {
									style: {
										flex: "1 1 auto",
										minWidth: 0,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									},
									children: text,
								}),
								jsx("span", {
									style: { ...SECONDARY, flex: "0 0 auto", fontVariantNumeric: "tabular-nums" },
									children: confidenceText(finding.confidence),
								}),
							],
						}),
					},
					`bf-finding:${index}`,
				);
			}

			/**
			 * The crop itself: a clip box the size of the recorded region, with
			 * the whole page image inside it offset by that region's origin. The
			 * caption states the page and the region in the page's own pixel
			 * coordinates, which is what "page and region" means on this project.
			 * @param finding - the selected finding.
			 * @param page - its page manifest entry.
			 */
			function cropFigure(finding, page) {
				const geometry = cropGeometry(finding.bbox, page);
				if (geometry === null) {
					return jsx("p", {
						style: SECONDARY,
						children: "This finding carries no usable region, so there is nothing to crop.",
					});
				}
				const locator = locatorGeometry(finding.bbox, page);
				const pageSrc = pageImageUrl(finding.page);
				const alt = `Page ${finding.page} of the ingested report, cropped to the region this finding was read from`;

				return jsxs("div", {
					style: { display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" },
					children: [
						jsxs("figure", {
							style: { display: "flex", flexDirection: "column", gap: "8px", margin: 0 },
							children: [
								jsx("div", {
									// The crop. `overflow: hidden` is the cut; the image
									// inside is the whole page, moved so the recorded
									// region is what lands in the opening.
									style: {
										position: "relative",
										overflow: "hidden",
										width: px(geometry.width),
										height: px(geometry.height),
										borderRadius: "12px",
										border: "1px solid var(--dsw-alias-border-l2)",
										background: "var(--dsw-alias-bg-layer-2)",
									},
									children: jsx("img", {
										src: pageSrc,
										alt,
										draggable: false,
										style: {
											position: "absolute",
											left: px(geometry.left),
											top: px(geometry.top),
											width: px(geometry.imageWidth),
											height: px(geometry.imageHeight),
											maxWidth: "none",
										},
									}),
								}),
								jsx("figcaption", {
									style: { ...SECONDARY, fontVariantNumeric: "tabular-nums" },
									children: `Page ${finding.page} · region ${finding.bbox.left}, ${finding.bbox.top} · ${finding.bbox.width} × ${finding.bbox.height} px · OCR confidence ${confidenceText(finding.confidence)}`,
								}),
							],
						}),
						locator === null
							? null
							: jsxs("figure", {
									style: { display: "flex", flexDirection: "column", gap: "8px", margin: 0 },
									children: [
										jsxs("div", {
											style: {
												position: "relative",
												width: px(locator.width),
												height: px(locator.height),
												borderRadius: "8px",
												overflow: "hidden",
												border: "1px solid var(--dsw-alias-border-l2)",
												background: "var(--dsw-alias-bg-layer-2)",
											},
											children: [
												jsx("img", {
													src: pageSrc,
													alt: `Whole of page ${finding.page}, with the cropped region outlined`,
													draggable: false,
													style: { display: "block", width: "100%", height: "100%" },
												}),
												jsx("span", {
													style: {
														position: "absolute",
														left: px(locator.markLeft),
														top: px(locator.markTop),
														width: px(locator.markWidth),
														height: px(locator.markHeight),
														border: "1px solid var(--dsw-alias-label-primary)",
														borderRadius: "2px",
													},
												}),
											],
										}),
										jsx("figcaption", { style: SECONDARY, children: "Where it sits on the page" }),
									],
								}),
					],
				});
			}

			/**
			 * The selected finding's detail: the text the engine read, then the
			 * crop it was read from. Claim first, evidence second — the order the
			 * panel argues in.
			 * @param finding - the selected finding.
			 * @param page - its page manifest entry, or undefined when the report has none.
			 */
			function detail(finding, page) {
				if (page === undefined || page.available !== true) {
					return jsx("p", {
						style: SECONDARY,
						children: `Page ${finding.page} of the report is not available, so this finding's region cannot be shown.`,
					});
				}
				const text = typeof finding.text === "string" && finding.text !== "" ? finding.text : "(no text read)";
				return jsxs("div", {
					style: { display: "flex", flexDirection: "column", gap: "12px" },
					children: [
						jsx("blockquote", {
							style: {
								margin: 0,
								paddingLeft: "12px",
								borderLeft: "2px solid var(--dsw-alias-border-l2)",
								color: "var(--dsw-alias-label-primary)",
							},
							children: text,
						}),
						cropFigure(finding, page),
					],
				});
			}

			/**
			 * The crop viewer. Lists every finding the ingestion service returned
			 * for the report; clicking one shows the region of the real page it
			 * was read from. Nothing is shown before a finding is clicked — the
			 * empty pane says what to do rather than pre-selecting a finding
			 * nobody asked for.
			 */
			function ProvenanceView() {
				const state = useProvenance();
				const [selectedIndex, setSelectedIndex] = useState(null);

				if (state.status === "loading") {
					return jsx("div", {
						style: { padding: "16px", ...SECONDARY },
						children: "Reading the ingested report's findings…",
					});
				}
				if (state.status === "error") {
					return jsxs("div", {
						style: { padding: "16px", display: "flex", alignItems: "center", gap: "8px", ...SECONDARY },
						children: [
							jsx(StateDot, { state: "error", size: 8 }),
							`The ingested report's findings could not be read — ${state.message}.`,
						],
					});
				}

				const payload = state.payload ?? {};
				const findings = Array.isArray(payload.findings) ? payload.findings : [];
				const pages = Array.isArray(payload.pages) ? payload.pages : [];
				const pageOf = (number) => pages.find((entry) => entry.page === number);

				if (findings.length === 0) {
					return jsx("div", {
						style: { padding: "16px", ...SECONDARY },
						children: "No document has been ingested, so there are no findings to show a crop for.",
					});
				}

				const selected = selectedIndex === null ? null : (findings[selectedIndex] ?? null);

				// The session body grows with its content and scrolls as a whole
				// (`ConversationRoot.module.css`, `.root[data-phase='active']
				// .viewArea { flex: 1 0 auto; min-height: auto }`), so this panel
				// cannot size itself off the parent's height — a `height: 100%`
				// here resolves against a `display: contents` wrapper and simply
				// takes the content's own height. Instead the list is capped and
				// scrolls itself, and the crop beside it sticks, so the evidence
				// stays on screen while the 156 findings are scrolled past it.
				return jsxs("section", {
					"aria-label": "Provenance crops",
					style: {
						display: "flex",
						alignItems: "flex-start",
						gap: "16px",
						padding: "16px",
						boxSizing: "border-box",
						color: "var(--dsw-alias-label-primary)",
					},
					children: [
						jsxs("div", {
							// `minWidth: 0` matters: without it the automatic minimum
							// size of a row of unwrapped text overrides the 320px
							// basis and the list eats the whole panel.
							style: {
								display: "flex",
								flexDirection: "column",
								gap: "8px",
								flex: "0 0 320px",
								minWidth: 0,
								maxHeight: "70vh",
							},
							children: [
								jsx("div", {
									style: SECONDARY,
									children: `${findings.length} findings read from ${payload.report ?? "the ingested report"}`,
								}),
								jsx("div", {
									role: "list",
									"aria-label": "Findings read from the ingested report",
									style: {
										display: "flex",
										flexDirection: "column",
										gap: "2px",
										overflowY: "auto",
										overflowX: "hidden",
										minHeight: 0,
										flex: "1 1 auto",
									},
									children: findings.map((finding, index) =>
										findingRow(finding, index, index === selectedIndex, setSelectedIndex),
									),
								}),
							],
						}),
						jsx("div", {
							style: { flex: "1 1 auto", minWidth: 0, position: "sticky", top: "16px" },
							children:
								selected === null
									? jsx("p", {
											style: SECONDARY,
											children: "Click a finding to see the crop of the page it was read from.",
										})
									: detail(selected, pageOf(selected.page)),
						}),
					],
				});
			}

			return ProvenanceView;
		}

		/**
		 * Client plugin body. Checks the React seam, then takes nine seats.
		 *
		 * Story 1.5's mark goes into `conversation.hero.brand.mark` — `single`,
		 * so occupying it replaces whatever the host registered there (the
		 * DeepSeek whale) — and `sidebar.brand.mark`, the collapsed-rail seat:
		 * with `@deepseek-ai/dsh-client-ui-brand-official` disabled
		 * (`cordis.patch.yml`, `id: ui-brand-official`) nothing else fills it,
		 * and ui-layout falls back to its own built-in whale rather than
		 * rendering nothing, so we take it too rather than leave that fallback
		 * showing.
		 *
		 * `sidebar.brand.mark` is not in the verified seat table in
		 * `docs/deepseek-harness-notes.md` — nothing in this repo confirms which
		 * package declares it (its one known filler, `ui-brand-official`, is the
		 * one we've disabled). Confirmed empirically instead, by screenshot
		 * (`docs/screenshots/1-5-brand-mark-*.png`): re-verify by source if a
		 * harness upgrade ever changes ui-layout's rail rendering.
		 *
		 * Story 1.4's task-type indicator goes into `conversation.hero.agentPreset`,
		 * replacing the host's own chip for this deployment. It displays; it does not
		 * choose (corrected 28 Aug 2026 — see `buildTaskTypeIndicator`).
		 *
		 * Story 3.2's provider disclosure goes into
		 * `conversation.session.header.utilities` — a session-scoped `list` slot,
		 * so it is additive rather than a replacement — naming the active
		 * model-plane provider, and saying "replay" and "authored" in plain words
		 * when that is the provider (see `buildProviderDisclosure`).
		 *
		 * Story 3.7's routing chip goes into `conversation.input.model` — `single`,
		 * so occupying it replaces the stock model picker
		 * (`@deepseek-ai/dsh-client-ui-model-selection`, disabled in the profile).
		 * It also registers a conversation view (`bf-routing`) and the event
		 * Definition that feeds it, both on `ctx.conversationEvents` /
		 * `ctx.conversationViews`, so the chip reads the router's recorded
		 * `router/routed` decision rather than recomputing it.
		 *
		 * Story 2.2's egress monitor takes two more: the compact chip shares
		 * `conversation.session.header.utilities` with the provider disclosure
		 * (list, additive), and the full panel takes `shell.overlay` (list,
		 * root). Both read one number — the count of `egress/denied` events —
		 * through a registered `bf-egress` conversation view; the chip toggles
		 * the panel through a module-scoped open store.
		 *
		 * Story 4.5's crop viewer takes `conversation.view` (list, session) — a
		 * whole tab beside Chat and Trajectory. It reads the ingestion capture
		 * and the real page images from the host's provenance route rather than
		 * from a session event: the findings are what a document ingested
		 * through Epic 4 produced, not something a turn recorded.
		 *
		 * Story 2.3's canary takes `conversation.input.right` (list, session):
		 * the button that fires a real outbound attempt through the host's
		 * loopback `/bf-canary` channel so the denial can be watched happening.
		 * It is registered behind a nested `ctx.inject(["connection"])` so that a
		 * client with no host transport loses the button and keeps everything
		 * else.
		 *
		 * A broken React seam aborts all nine: every one of them renders
		 * through the host's `react/jsx-runtime`, so registering into a slot
		 * without it would trade one loud console error for obscure render
		 * failures. (The conversation Definitions carry no React and are
		 * registered regardless — a chip that never renders still leaves the
		 * session log's routing and egress views correct for anything else
		 * that reads them.)
		 * @param ctx - client root context, carrying the `slots`,
		 * `conversationEvents`, `conversationViews` and `sessions` services
		 * declared in `inject` below.
		 */
		function apply(ctx) {
			const disposeRoutingView = ctx.conversationViews?.register?.(routingViewDefinition);
			const disposeRoutingEvents = ctx.conversationEvents?.register?.(routingNodeDefinition);
			const disposeEgressView = ctx.conversationViews?.register?.(egressViewDefinition);
			const disposeEgressEvents = ctx.conversationEvents?.register?.(egressNodeDefinition);
			if (!checkHostReactSeam()) {
				return () => {
					disposeRoutingView?.();
					disposeRoutingEvents?.();
					disposeEgressView?.();
					disposeEgressEvents?.();
				};
			}
			const disposeTabTitle = holdTabTitle();
			const TaskTypeIndicator = buildTaskTypeIndicator();
			const ProviderDisclosure = buildProviderDisclosure();
			const RoutingChip = buildRoutingChip(ctx);
			const EgressChip = buildEgressChip(ctx);
			const EgressPanel = buildEgressPanel(ctx);
			const SealBand = buildSealBand(ctx);
			const ProvenanceView = buildProvenanceView();
			const disposeSidebarMark = ctx.slots.inject("sidebar.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, FaradayMark);
			});
			const disposeHeroMark = ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, FaradayMark);
			});
			// `conversation.hero.agentPreset` is a child slot the hero declares once
			// it renders, not a standing seam: registering before that declaration
			// exists fails loud ("slot ... is not declared"). `ctx.slots.inject`
			// defers the register/dispose pair until the parent has declared it.
			const disposeIndicator = ctx.slots.inject("conversation.hero.agentPreset", () => {
				const dispose = ctx.slots.register(
					{ name: "conversation.hero.agentPreset", id: "bf-task-type-indicator" },
					TaskTypeIndicator,
				);
				return () => { dispose(); };
			});
			// `conversation.session.header.utilities` is a session-scoped list slot
			// ui-conversation declares — additive, so this pill sits alongside
			// whatever else registers there (the egress chip, in a later story).
			const disposeProviderDisclosure = ctx.slots.inject("conversation.session.header.utilities", () => {
				const dispose = ctx.slots.register(
					{ name: "conversation.session.header.utilities", id: "bf-provider-disclosure" },
					ProviderDisclosure,
				);
				return () => { dispose(); };
			});
			// The egress monitor's compact chip shares that same session-scoped
			// list slot (Story 2.2). The `inject` factory hands it the resolved
			// session id so it can read that session's `bf-egress` view; clicking
			// it toggles the full panel below.
			const disposeEgressChip = ctx.slots.inject("conversation.session.header.utilities", () => {
				const dispose = ctx.slots.register(
					{
						name: "conversation.session.header.utilities",
						id: "bf-egress-chip",
						inject: (sessionId) => ({ sessionId }),
					},
					EgressChip,
				);
				return () => { dispose(); };
			});
			// The egress monitor's full panel takes `shell.overlay` (list, root).
			// Root-scoped, so no session id is injected — the panel reads
			// `ctx.sessions.list.current` itself. It renders only once the chip
			// has opened it.
			const disposeEgressPanel = ctx.slots.inject("shell.overlay", () => {
				const dispose = ctx.slots.register(
					{ name: "shell.overlay", id: "bf-egress-panel" },
					EgressPanel,
				);
				return () => { dispose(); };
			});
			// The open-seal band shares `shell.overlay` with the panel (list, root).
			// It renders nothing while the seal is closed, which is almost always,
			// and takes space at the top of the window when it is not — see
			// `buildSealBand` for why that is a band rather than a colour.
			const disposeSealBand = ctx.slots.inject("shell.overlay", () => {
				const dispose = ctx.slots.register({ name: "shell.overlay", id: "bf-seal-band" }, SealBand);
				return () => { dispose(); };
			});
			// The canary takes `conversation.input.right` (list, session) — the
			// composer tool row, before the send button. Deferred behind
			// `ctx.inject(["connection"])` rather than named in this plugin's own
			// `inject` list: a hard gate on a service the headless client has no
			// reason to provide would take the other seven seats down with it, and
			// the monitor is worth more than the button that calibrates it.
			let disposeCanary;
			let disposeUpload;
			let disposeResidency;
			ctx.inject(["connection"], (canaryCtx) => {
				// Point the seal store at the host transport and read the seal once.
				// Everything that displays the seal — the band, the chip, the panel's
				// control — reads that answer rather than assuming one, so a reloaded
				// page shows the machine's real state instead of the safe-looking one.
				seal.bind(canaryCtx.connection);
				const CanaryButton = buildCanaryButton(canaryCtx.connection);
				disposeCanary = canaryCtx.slots.inject("conversation.input.right", () => {
					const dispose = canaryCtx.slots.register(
						{
							name: "conversation.input.right",
							id: "bf-canary",
							label: "Canary",
							inject: (sessionId) => ({ sessionId }),
						},
						CanaryButton,
					);
					return () => { dispose(); };
				});

				// The upload control takes the same seat, deferred behind the same
				// `connection` gate and for the same reason. `order` puts it before the
				// canary: the natural left-to-right reading of the row is "give it a
				// document, then prove nothing left the box", which is also the order
				// the demo does them in.
				// Residency takes a seat in the session header beside the egress chip
				// and the provider chip, not the composer row — it describes the
				// machine's state rather than offering an action, and the header is
				// where this product already puts that.
				const ResidencyChip = buildResidencyChip(canaryCtx.connection);
				disposeResidency = canaryCtx.slots.inject("conversation.session.header.utilities", () => {
					const dispose = canaryCtx.slots.register(
						{ name: "conversation.session.header.utilities", id: "bf-residency", label: "Residency", order: 20 },
						ResidencyChip,
					);
					return () => { dispose(); };
				});

				const UploadButton = buildUploadButton(canaryCtx.connection);
				disposeUpload = canaryCtx.slots.inject("conversation.input.right", () => {
					const dispose = canaryCtx.slots.register(
						{
							name: "conversation.input.right",
							id: "bf-upload",
							label: "Upload",
							order: -10,
						},
						UploadButton,
					);
					return () => { dispose(); };
				});
			});
			// `conversation.view` is a session-scoped `list` slot: each entry is a
			// tab in the session's view ring, rendered one at a time. `label` is
			// what the tab reads; ui-conversation falls back to the entry id when
			// a registration has none, which would put "bf-provenance" on screen.
			// `order` puts it after Chat (0) and the shipped trajectory tab (10).
			const disposeProvenanceView = ctx.slots.inject("conversation.view", () => {
				const dispose = ctx.slots.register(
					{
						name: "conversation.view",
						id: PROVENANCE_VIEW_ID,
						order: 20,
						label: "Provenance",
					},
					ProvenanceView,
				);
				return () => { dispose(); };
			});
			// `conversation.input.model` is a session-scoped `single` slot
			// ui-conversation declares. The stock picker is disabled in the
			// profile, so this occupies it outright. The `inject` factory hands
			// the framework-resolved session id to the component, which reads the
			// `bf-routing` view for that session.
			const disposeRoutingChip = ctx.slots.inject("conversation.input.model", () => {
				const dispose = ctx.slots.register(
					{
						name: "conversation.input.model",
						id: "bf-routing-chip",
						inject: (sessionId) => ({ sessionId }),
					},
					RoutingChip,
				);
				return () => { dispose(); };
			});
			return () => {
				disposeTabTitle();
				disposeSidebarMark();
				disposeHeroMark();
				disposeIndicator?.();
				disposeProviderDisclosure?.();
				disposeEgressChip?.();
				disposeEgressPanel?.();
				disposeSealBand?.();
				disposeCanary?.();
				disposeUpload?.();
				disposeResidency?.();
				disposeRoutingChip?.();
				disposeProvenanceView?.();
				disposeRoutingView?.();
				disposeRoutingEvents?.();
				disposeEgressView?.();
				disposeEgressEvents?.();
			};
		}

		/** Cordis services this plugin needs from the client root context. */
		const inject = ["slots", "conversationEvents", "conversationViews", "sessions"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
