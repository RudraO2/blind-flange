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

		/** The denial marker the host half appends; see `index.js` `EGRESS_DENIED_EVENT`. */
		const EGRESS_DENIED_EVENT = "egress/denied";
		const EGRESS_VIEW_TARGET = "bf-egress";
		const EGRESS_DEFINITION_KIND = "bf-egress";

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
				return {
					count: entries.length,
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
				return event && event.type === EGRESS_DENIED_EVENT
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
					tool: data.tool,
					target: data.target,
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
				const session = ctx.sessions?.binding?.(props.sessionId)?.session ?? null;
				const snapshot = useSyncExternalStore(
					(onChange) => (session ? session.subscribe(onChange) : () => {}),
					() => readEgressSnapshot(session),
				);
				const ready = snapshot !== null;
				const count = ready ? snapshot.count : null;
				const breached = ready && count > 0;

				return jsx(Pill, {
					active: breached,
					onClick: () => egressPanelOpen.toggle(),
					"aria-haspopup": "dialog",
					title: breached
						? `Egress monitor: ${count} outbound attempt${count === 1 ? "" : "s"} denied and recorded this session. Open for the audit detail.`
						: "Egress monitor: no outbound attempt has been made this session. The count is the number of recorded denials, not a fixed label.",
					children: jsxs("span", {
						style: { display: "inline-flex", alignItems: "center", gap: "6px" },
						children: [
							jsx(StateDot, { state: breached ? "error" : "done", size: 8 }),
							ready ? `Egress ${count}` : "Egress",
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
			const { useEffect, useRef, useSyncExternalStore } = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { StateDot, Button } = require("@deepseek-ai/dsh-client-ui-primitives");

			const SECONDARY = { color: "var(--dsw-alias-label-secondary)" };

			/** Current session id from the sessions list store, or null. */
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
				const tool = typeof entry.tool === "string" && entry.tool !== "" ? entry.tool : "unrecorded tool";
				const target =
					typeof entry.target === "string" && entry.target !== "" ? entry.target : "unrecorded target";
				return jsxs(
					"div",
					{
						role: "listitem",
						title: `${denialStamp(entry.time)} — ${tool} attempted ${target}. Denied by egress denial and written to the session log.`,
						style: { display: "flex", flexDirection: "column", gap: "2px" },
						children: [
							jsxs("div", {
								style: { display: "flex", alignItems: "baseline", gap: "8px" },
								children: [
									jsx("span", {
										style: { ...SECONDARY, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" },
										children: denialClock(entry.time),
									}),
									jsx("span", { style: { flex: "1 1 auto", minWidth: 0 }, children: tool }),
								],
							}),
							jsx("div", { style: { ...SECONDARY, wordBreak: "break-all" }, children: target }),
						],
					},
					`bf-egress-line:${entry.seq}`,
				);
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
				const session = useCurrentSession();
				const snapshot = useSyncExternalStore(
					(onChange) => (session ? session.subscribe(onChange) : () => {}),
					() => readEgressSnapshot(session),
				);

				const ready = snapshot !== null;
				const count = ready ? snapshot.count : null;
				const breached = ready && count > 0;
				const entries = ready && Array.isArray(snapshot.entries) ? snapshot.entries : [];

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

				const body = !ready
					? jsx("span", { style: SECONDARY, children: "Waiting for a session." })
					: jsxs("span", {
							style: SECONDARY,
							children: [
								breached
									? `${count} outbound attempt${count === 1 ? "" : "s"} denied and written to the session log.`
									: "No outbound attempt has been made. This zero is counted from the denial log, not printed.",
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
								jsx(StateDot, { state: breached ? "error" : "done", size: 10 }),
								jsx("strong", { style: { flex: "1 1 auto" }, children: "Egress monitor" }),
								jsx("span", {
									style: { ...SECONDARY, fontVariantNumeric: "tabular-nums" },
									children: ready ? String(count) : "—",
								}),
							],
						}),
						body,
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
			 * Four outcomes, and the button says which one it is rather than
			 * looking the same after every press. `denied` is the expected one —
			 * red, matching the monitor. `allowed` is amber, because a canary that
			 * got out means the seal is not holding and that is the one result
			 * nobody should be able to miss.
			 */
			const COPY = {
				idle: "Fire the canary: attempt a real outbound connection and watch egress denial refuse it.",
				firing: "Firing the canary — attempting an outbound connection.",
				denied: "Canary denied. The attempt was refused by egress denial and written to the audit log.",
				allowed: "Canary was NOT denied — the outbound connection completed. Egress denial is not holding.",
				failed: "The canary could not be fired. The host did not answer.",
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
						setPhase(result.value?.denied === true ? "denied" : "allowed");
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
						: phase === "denied"
							? "error"
							: phase === "allowed" || phase === "failed"
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
						children: [dot === null ? null : jsx(StateDot, { state: dot, size: 8 }), "Canary"],
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
			const ProvenanceView = buildProvenanceView();
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
			// The canary takes `conversation.input.right` (list, session) — the
			// composer tool row, before the send button. Deferred behind
			// `ctx.inject(["connection"])` rather than named in this plugin's own
			// `inject` list: a hard gate on a service the headless client has no
			// reason to provide would take the other seven seats down with it, and
			// the monitor is worth more than the button that calibrates it.
			let disposeCanary;
			ctx.inject(["connection"], (canaryCtx) => {
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
				disposeCanary?.();
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
