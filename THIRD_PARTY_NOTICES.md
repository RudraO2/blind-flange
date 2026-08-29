# Third-party notices

Blind Flange is built on DeepSeek Harness. Their `BRAND_GUIDELINES.md` blesses that line
verbatim and forbids putting "DeepSeek Harness" in our project *name* — "Blind Flange" does
not, so it is unaffected. Both components below are MIT and both require the copyright notice
to be retained; this file is that retention (NFR11).

## DeepSeek Harness

`deepseek-ai/deepseek-harness`, read from its `LICENSE` at `master`, 27 August 2026 (see
`docs/licence-policy.md`).

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Cordis

`cordiverse/cordis`, the plugin framework underneath the harness, read from its `LICENSE` at
`main`, 27 August 2026.

```
MIT License

Copyright (c) 2021-present Shigma

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## The rest of the tree

Story 6.4 audited it. `scripts/licence-audit.mjs` enumerates every transitive licence across
the harness tree, the web profile, our own packages and the Python ingestion service — **490
components on 28 August 2026** — and `docs/licence-audit.md` is its output. Run it yourself
with `npm run licence-audit`; it is also part of `npm test`, and it exits non-zero if
anything outside the allow-list has no decision recorded against it.

### The one adopted plugin, and the engines it carries

`@changfenhuang/dsh-genui@0.9.3` (**MIT**, Copyright (c) 2026 dsh-external) is the only
third-party plugin this project adopts (Story 8.1). It renders the ```dsh-ui fence the key
findings are written into. Its licence was read from the `LICENSE` file in the installed
package at the pinned version, not from the repository badge, and it resolves exactly one
runtime dependency of its own: `react` (MIT).

The package also **vendors three rendering engines as prebuilt bundles** under `lib/assets/`,
which no metadata field names — the same class of finding as libvips inside `sharp`:

| Engine | Version | Licence | Read from |
|---|---|---|---|
| Apache ECharts | 5.6.0 | Apache-2.0 | the pinned `pnpm-lock.yaml` at tag `v0.9.3`; `lib/assets/echarts.js` carries the Baidu copyright line |
| three.js | 0.180.0 | MIT | `lib/assets/three.js` carries `SPDX-License-Identifier: MIT` in its own banner |
| Mermaid | 11.16.0 | MIT | the pinned lockfile; its bundle preserves the **DOMPurify 3.4.13** banner, dual `MPL-2.0 OR Apache-2.0` — **Apache-2.0 elected** |

`echarts.js` also carries Microsoft's `tslib` runtime helpers (0BSD). Every licence in that
table is on the allow-list, and the election on DOMPurify is what keeps it there.

**None of the three is executed here.** Blind Flange's permitted component set is tables,
charts and plots (`plugins/dsh-client-ui-base/lib/genui/permitted-set.js`, held by
`test/genui.test.js`), and none of those three types reaches an engine. Measured in the
running workbench on 29 August 2026: `echarts.js` was never requested at all, and
`mermaid.js` and `three.js` were fetched **from loopback as `<link rel="prefetch">` hints and
never executed** — no script element, no `window.__GenuiAssets__` entry, and `window.mermaid`,
`window.THREE` and `window.echarts` all `undefined`. Redistributed, not linked.

### The harness's own disclosure, checked against what actually installs

`deepseek-ai/deepseek-harness` publishes a `THIRD_PARTY_NOTICES.md` in its repository root
disclosing roughly 150 components. **It is not shipped inside the npm package** — it is not
in `@deepseek-ai/dsh@0.1.1-rc.2` on disk — so it was read from the repository at `master` on
28 August 2026 and cross-checked against the resolved tree.

The check matters because a disclosure is a claim and the installed tree is the fact, and
here they differ in our favour. The three entries in that document that would have been
problems are all absent from what actually installs into a profile:

| Named in the harness's notices | Licence | In the resolved tree? |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | "SEE LICENSE IN README.md" — not establishable from metadata | **No.** Only `@anthropic-ai/sdk@0.91.1` (MIT) is present. |
| `eslint-plugin-sonarjs` | LGPL-3.0-only | **No.** Development-only, as its own notice says. |
| `lightningcss` | MPL-2.0 | **No.** Development-only. |

Development dependencies do not install into a `dsh` profile, so the harness's notices
overstate what ships. That is the right direction for a disclosure to err, and it is why this
project's audit enumerates the resolved tree rather than trusting the document: the document
is a superset, and a superset cannot tell you what you are actually shipping.

### Weak copyleft in the resolved tree

Two components carry it, and they are named here because this file is the notice retention
and they are the two that need one:

**libvips**, under **LGPL-3.0-or-later**, reaches the runtime inside
`@img/sharp-win32-x64@0.35.4`, which `sharp@0.35.4` resolves for this platform and which
`@deepseek-ai/dsh-attachment-local` requires. It is shipped unmodified. LGPL-3.0 §4 permits
conveying a work that links a library under these terms provided the library is identified
and can be relinked; this notice is that identification, and the library is the stock
prebuilt binary from the `@img` distribution.

**Eigen**, under **MPL-2.0**, is compiled into `onnxruntime@1.24.4` and named in that
package's own `ThirdPartyNotices.txt`. It is unmodified. MPL-2.0's source-availability
obligation attaches to modified MPL-licensed files; there are none.

Every other copyleft component found by the audit was removed or is not loaded — see
"Copyleft, decided one at a time" in `docs/licence-policy.md`, and
`docs/licence-decisions.json` for the evidence behind each.
