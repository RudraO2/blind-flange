/**
 * Blind Flange base plugin, browser half.
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
 * occupant: the Blind Flange mark in `conversation.hero.brand.mark` and
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
 * same host RPCs and shows only the presets Blind Flange authored
 * (`trust: 'user'`), so "Standard mode" and its shipped siblings never appear
 * here even though the host still lists them elsewhere (Settings > Agent
 * presets, unavoidably, for the same reason).
 *
 * It shipped as a dropdown and was corrected to a read-only indicator on
 * 28 Aug 2026: SIH26117 requires the system to pick automatically, so a control
 * asking the operator to classify the task contradicts the entry's own claim.
 *
 * Story 3.2 takes one more seat: `conversation.session.header.utilities`, a
 * read-only pill naming the active model-plane provider. When `replay` is the
 * provider it says so in plain words and says the responses are authored, not
 * captured (ADR-0001 amendment, 28 Aug 2026). The provider name is read from
 * the host's `llm.providers` directory — the Blind Flange adapter registered
 * in the host half (`index.js`) surfaces there as `Blind Flange (<provider>)` —
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
 */
window.__ModuleLoader__.load({
	id: "@blind-flange/dsh-client-ui-base",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** Everything a Blind Flange panel needs from the host's React. */
		const REQUIRED_JSX_EXPORTS = ["jsx", "jsxs", "Fragment"];

		/**
		 * A bolted-shut pipe flange, six holes around a solid plate — the
		 * metaphor the project is named for. `fill="currentColor"` so it
		 * inherits the hero's own text colour rather than a hard-rolled hex,
		 * which is what makes it correct in both themes without a media query.
		 */
		const FLANGE_PATH_D =
			"M 1.5,12 A 10.5,10.5 0 1,0 22.5,12 A 10.5,10.5 0 1,0 1.5,12 Z" +
			"M 10.6,4.5 A 1.4,1.4 0 1,0 13.4,4.5 A 1.4,1.4 0 1,0 10.6,4.5 Z" +
			"M 17.1,8.25 A 1.4,1.4 0 1,0 19.9,8.25 A 1.4,1.4 0 1,0 17.1,8.25 Z" +
			"M 17.1,15.75 A 1.4,1.4 0 1,0 19.9,15.75 A 1.4,1.4 0 1,0 17.1,15.75 Z" +
			"M 10.6,19.5 A 1.4,1.4 0 1,0 13.4,19.5 A 1.4,1.4 0 1,0 10.6,19.5 Z" +
			"M 4.1,15.75 A 1.4,1.4 0 1,0 6.9,15.75 A 1.4,1.4 0 1,0 4.1,15.75 Z" +
			"M 4.1,8.25 A 1.4,1.4 0 1,0 6.9,8.25 A 1.4,1.4 0 1,0 4.1,8.25 Z";

		/**
		 * The Blind Flange mark. Same `size`/`className` shape the host's own
		 * `OfficialBrandMark` takes, since `conversation.hero.brand.mark` is a
		 * `single` slot and this occupies it outright.
		 */
		function BlindFlangeMark({ size, className }) {
			let jsxRuntime;
			try {
				jsxRuntime = require("react/jsx-runtime");
			} catch {
				return null;
			}
			if (typeof jsxRuntime?.jsx !== "function") return null;
			return jsxRuntime.jsx("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 24 24",
				width: size,
				height: size,
				className,
				"aria-hidden": true,
				focusable: "false",
				children: jsxRuntime.jsx("path", { d: FLANGE_PATH_D, fill: "currentColor", fillRule: "evenodd" }),
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
					"@blind-flange/dsh-client-ui-base: the host did not supply react/jsx-runtime — no Blind Flange panel can render",
					error,
				);
				return false;
			}
			const missing = REQUIRED_JSX_EXPORTS.filter((name) => jsxRuntime?.[name] === undefined);
			if (missing.length > 0) {
				console.error(
					`@blind-flange/dsh-client-ui-base: the host's react/jsx-runtime is missing ${missing.join(", ")} — Blind Flange panels will not render correctly`,
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
			 * The read path below is kept deliberately: Story 3.8 makes the router set
			 * the active preset when it reclassifies, and this is the surface that
			 * shows it moving.
			 *
			 * Rendered as a bare inherited element rather than a `Button`. There is no
			 * tag or badge primitive in the harness, a `Button` with no handler still
			 * reads as clickable, and a disabled one reads as broken. An unstyled
			 * element inherits the hero's own typography and density, which is what the
			 * design rule asks for and costs no hand-rolled colour, radius or spacing.
			 * @returns the indicator, or null while loading and when the deployment
			 * authors no Blind Flange preset.
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
					title: "Task type, selected by the router. Blind Flange classifies the request; there is nothing here to set.",
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
					"Blind Flange is answering from the replay provider: stored responses authored by hand for this Phase 0 build, served in place of live model inference and disclosed here as the operating mode. Per the 28 August 2026 amendment to ADR-0001 there is no local run to capture from yet, so replacing an authored response with a captured one later is a data change, not a code change.",
			},
			local: {
				label: "Local — offline inference",
				title:
					"Blind Flange is answering from the local provider: llama.cpp on this machine, with no network path off the box.",
			},
			remote: {
				label: "Remote — development only",
				title:
					"Blind Flange is answering from the remote provider: a rented GPU used only during development. ADR-0001 keeps it out of every demo and recording.",
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
			 * Flange adapter by its `Blind Flange (<provider>)` display name — the
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
								row.displayName.startsWith("Blind Flange (") &&
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
					title: `Blind Flange is answering from the ${provider} provider.`,
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
			const OUR_PRODUCT_TITLE = "Blind Flange";

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

		/**
		 * Client plugin body. Checks the React seam, then takes five seats.
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
		 * A broken React seam aborts all five: every one of them renders
		 * through the host's `react/jsx-runtime`, so registering into a slot
		 * without it would trade one loud console error for obscure render
		 * failures. (The conversation Definitions carry no React and are
		 * registered regardless — a chip that never renders still leaves the
		 * session log's routing view correct for anything else that reads it.)
		 * @param ctx - client root context, carrying the `slots`,
		 * `conversationEvents`, `conversationViews` and `sessions` services
		 * declared in `inject` below.
		 */
		function apply(ctx) {
			const disposeRoutingView = ctx.conversationViews?.register?.(routingViewDefinition);
			const disposeRoutingEvents = ctx.conversationEvents?.register?.(routingNodeDefinition);
			if (!checkHostReactSeam()) {
				return () => {
					disposeRoutingView?.();
					disposeRoutingEvents?.();
				};
			}
			const disposeTabTitle = holdTabTitle();
			const TaskTypeIndicator = buildTaskTypeIndicator();
			const ProviderDisclosure = buildProviderDisclosure();
			const RoutingChip = buildRoutingChip(ctx);
			const disposeSidebarMark = ctx.slots.inject("sidebar.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, BlindFlangeMark);
			});
			const disposeHeroMark = ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, BlindFlangeMark);
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
				disposeRoutingChip?.();
				disposeRoutingView?.();
				disposeRoutingEvents?.();
			};
		}

		/** Cordis services this plugin needs from the client root context. */
		const inject = ["slots", "conversationEvents", "conversationViews", "sessions"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
