# Egress redesign — the task list

Decided 30 August 2026 from the design review at
<https://claude.ai/code/artifact/533df775-62a9-44a3-a4b3-29d8ad65714f>.

**The shape:** Option A — a permanent seal row at the sidebar foot plus one right drawer —
with Option C's ring on the mark. The canary goes. The drawer is resizable.

Decisions taken with it, so they are not re-litigated at the point of use:

| # | Decision |
|---|---|
| Q1 | Option A, plus the ring from C. Option B (a bottom status bar) stays in reserve — it reads the same store, so promoting the foot row to a strip later is a change of position, not a rewrite. |
| Q2 | The drawer is called **Sovereignty**. Added to `CONTEXT.md` as a surface. |
| Q3 | A denial does **not** leave the interface permanently red. Persistent colour states the seal only; a denial gets a toast and a few seconds of emphasis on the count. `CONTEXT.md`'s "watch the monitor turn red" changes with it. |
| Q4 | The drawer **insets** the conversation rather than floating over it, so it can stay open for a whole demo. |
| Q5 | Residency leaves the session header for a collapsed row in the drawer. "Open the drawer" becomes a scripted demo step. |
| Q6 | The deny policy is widened **before** the canary is deleted. First commit, not last. |

---

## Phase 0 — close the hole the canary was hiding

The canary is the only reason the demo never exercises the launcher path. Removing it
without this would leave a hole that opens on stage.

**Evidence, gathered 30 Aug 2026.** Run against the real `tools/pre-execute` listener with
the seal **closed**, 7 of 11 "open WhatsApp" routes were allowed through to their tool body:

```
DENIED   web_fetch   https://web.whatsapp.com/
DENIED   web_search  {"queries":["whatsapp web"]}
DENIED   pwsh        Invoke-WebRequest -Uri https://web.whatsapp.com
ALLOWED  pwsh        Start-Process "https://web.whatsapp.com"
ALLOWED  pwsh        Start-Process msedge "https://web.whatsapp.com"
ALLOWED  pwsh        start https://web.whatsapp.com
ALLOWED  pwsh        explorer.exe "https://web.whatsapp.com"
ALLOWED  pwsh        Start-Process "whatsapp://send?text=hi"
ALLOWED  pwsh        cmd /c start "" https://web.whatsapp.com
ALLOWED  pwsh        [System.Diagnostics.Process]::Start("https://web.whatsapp.com")
DENIED   pwsh        python -c "import webbrowser; webbrowser.open(...)"
```

And nothing else catches them. The harness's own sandbox is documented as having no network
policy at all — `@deepseek-ai/dsh-sandbox`: *"File effects are the whole policy vocabulary —
the seam expresses no network, process, syscall, device, or credential restrictions"*;
`@deepseek-ai/dsh-sandbox-windows-acl`: *"Writes are restricted; reads, network, and process
visibility are not"* and *"Read-side confinement and network policy are out of scope"*. Our
waterfall is the only thing there is.

- [x] **0.1** Add a launcher-verb pattern and a URI-argument pattern to `lib/index.js`, and
      report each as its own denial reason.
- [x] **0.2** Tests: every route above is denied with the seal closed; the coding lane's own
      commands still run.
- [x] **0.3** Re-run the probe. 11 of 11 denied.

## Phase 1 — remove the canary

- [x] **1.1** Delete `lib/egress/canary.js` and `test/canary.test.js`.
- [x] **1.2** `lib/index.js` — drop the imports, `CANARY_TOOL_NAME` from `NETWORK_TOOL_NAMES`,
      the tool registration, the `/bf-canary` channel, `config.canary.target`.
- [x] **1.3** `lib/client.js` — drop `buildCanaryButton`, its `conversation.input.right`
      seat, and the "a call got out, open the panel" hook the toast replaces.
- [x] **1.4** Trim the canary assertions out of `client.test.js` and `index.test.js`.
- [x] **1.5** Keep `egress/permitted` and `egress/escaped` in the view vocabulary. `permitted`
      is now the only one written; a stored session containing `escaped` must still open.

## Phase 2 — the surfaces

- [x] **2.1** The seal row at `sidebar.footer.action` (list, **root** — present on the hero and
      in a session). Wide form `● Sealed  0`; rail form a bare dot. Opens the drawer.
- [x] **2.2** The ring on `sidebar.brand.mark` and the hero mark: continuous when sealed,
      broken and amber when open.
- [x] **2.3** The Sovereignty drawer in `shell.overlay`, resizable by dragging its left edge,
      width remembered across sessions.
- [x] **2.4** Drawer contents in order of consequence: seal + switch, the two figures and the
      ledger, residency (collapsed), model plane (collapsed), export footer.
- [x] **2.5** The conversation insets while the drawer is open.
- [x] **2.6** A toast on each denial, naming the tool and the target, with **Show** opening
      the drawer.
- [x] **2.7** Remove the egress chip and the residency chip from
      `conversation.session.header.utilities`. The provider disclosure stays.
- [x] **2.8** Export the egress log as a file from the drawer footer.
- [x] **2.9** Screenshots, both themes.

## Phase 3 — the record

- [x] **3.1** `CONTEXT.md` — retire **Canary**; rewrite **The seal**, **Egress monitor**,
      **Sovereignty proof**; add **Sovereignty drawer**.
- [x] **3.2** `docs/adr/0007-the-request-is-the-canary.md`.
- [x] **3.3** `HANDOFF.md`, `README.md`, `docs/demo-runbook.md`.
- [x] **3.4** `epics.md` / `sprint-status.yaml` — Story 2.3 superseded, with the reason.
- [x] **3.5** `npm test` green; commit and push.
