# Licence policy

**This is a hard constraint, not a preference.** It applies to model weights, to every
runtime dependency, and to the harness. Any architecture, story, or dependency choice that
violates it is rejected regardless of technical merit.

## The rule

**Apache-2.0 and MIT only.** Nothing else ships.

## Why it is absolute

The client is MRPL — an ONGC subsidiary, a Miniratna CPSE, a government-owned company. For
that buyer a licence carrying a monthly-active-user ceiling, a no-competing-model clause, or
a jurisdictional carve-out is not a technical inconvenience. It is a legal review that stalls
deployment for months. Community-licensed weights trigger PSU legal review *even when you are
far under any user cap*, because someone has to certify that you are and will remain under it.

This is the argument almost no competing team will make, and it is the one that reads as
adult engineering to an industrial evaluator. It is worth more than a benchmark chart.

The cautionary example is already in the pitch: MinIO relicensed away from Apache-2.0, which
is why file storage here is a plain filesystem vault. Permissive today is not permissive
forever — pin versions and record the licence at the version you pinned.

## Enforcement, not assertion

Saying "we only use permissive licences" proves nothing. Three mechanisms make it checkable:

1. **The model registry** carries a `license:` field per fleet member, alongside name, size,
   context, modalities and capabilities. It is the highest-leverage file in the project — it
   drives the router, the loader, the UI picker, the licence check and the attestation
   manifest from one place.
2. **The loader refuses** to load any model whose licence class is outside the allow-list in
   the policy file. Not a warning. A refusal.
3. **The attestation report** hands the evaluator an SBOM with the licence of every
   component. The claim is auditable at the moment it is made.

## Verified so far

| Component | Licence | Verified |
|---|---|---|
| DeepSeek Harness (`deepseek-ai/deepseek-harness`) | MIT | 27 Aug 2026, read from repo `LICENSE`, not from documentation |

Everything else must be verified the same way before it enters the stack: read the actual
`LICENSE` file at the version you will pin, not the README, not a blog post, not a summary.

## What this rules out

- Weights under bespoke community licences with user caps or use restrictions
- Anything AGPL, SSPL, BUSL, or a source-available licence with a commercial-use carve-out
- Any dependency whose licence cannot be established at all

When a component fails this test, the answer is to find a permissive equivalent, not to seek
an exception.
