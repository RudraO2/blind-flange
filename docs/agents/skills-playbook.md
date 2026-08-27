# Skills playbook — Blind Flange

Which skill to reach for, on this project, in this phase. The skills themselves are
generic; this is how they fit SIH26117.

**Phase: building the Phase 0 prototype for the IITM BS internal round.** Spec is at
`.scratch/phase-0-spine/spec.md`.

## The main line

```
/to-tickets .scratch/phase-0-spine/spec.md      <- once, this chat or next
     |
     v
.scratch/phase-0-spine/issues/01..NN.md          <- tracer-bullet vertical slices
     |
     v
/implement .scratch/phase-0-spine/issues/01-<slug>.md    <- one per chat
     |  drives /tdd at seams, closes with /code-review
     v
next ticket, fresh chat
```

`/to-tickets` will quiz you on granularity and blocking edges before it writes anything.
Push back there — it is cheaper to re-slice tickets than to re-slice code.

`/implement` is one ticket per chat. That is the point: each slice gets a clean context
window instead of the crowded tail of the last one.

## Which skill, when

| Situation | Reach for |
|---|---|
| Turn the spec into buildable slices | `/to-tickets` |
| Build one slice | `/implement` |
| Write the tests for a slice | `/tdd` — usually reached by `/implement`, no need to call it |
| "How should this panel look?" | `/prototype` |
| Something is broken, slow, or throwing | `/diagnosing-bugs` — model-invoked, just describe it |
| A fact blocks a decision (a library's real limits, a paper's actual claim) | `/research` — model-invoked |
| Stuck on a decision, need pushing | `/grill-me` |
| Where does this module's seam go? | `/codebase-design` |
| Review before committing | `/code-review` |
| New term, or a decision worth recording | `/domain-modeling` → `CONTEXT.md` or `docs/adr/` |

## /prototype — the one that matters most right now

ADR-0002 says the panels are the product for this round, and panels are exactly what
`/prototype` is for. It builds **throwaway** artifacts that answer a design question, then
they die — nothing from a prototype becomes the real frontend.

Two shapes, and the question picks:

- **UI** question → several radically different variants behind one route, `?variant=`.
- **Logic** question → one throwaway HTML file you open and poke.

The three panels that decide the round, each worth prototyping before building:

```
/prototype Three takes on the egress monitor for the canary beat: (1) a calm always-on
strip that turns red, (2) a full-screen interrupt, (3) a log tail that highlights the
blocked line. It has to read from the back of a room in under ten seconds.
```

```
/prototype Two takes on the routing chip expanded state: (1) a horizontal score bar per
fleet member, (2) a small table with task-type classification on top. The point a judge
must grasp instantly is that the model was CHOSEN, not configured.
```

```
/prototype The provenance crop viewer: clicking a finding highlights the page region it
came from. Logic question first - what's the state model when one finding spans two
regions on different pages?
```

## /wayfinder — parked

Wayfinder is for **fog**: work whose route you cannot see. The route here is charted —
§17 Phase 0 in the artifact, and now `spec.md`. Wayfinder's own rule is that no fog means
no map, and it will tell you so and stop.

Unpark it when a genuinely foggy effort appears. Candidates for later phases:

- **`model-fleet-lock`** — which models at which quantisation once hardware is known
- **`router-scoring`** — what the classifier actually scores on (Phase 3)
- **`finale-build-plan`** — six lanes across Sep–Dec, once the team is really six people

Then: `/wayfinder <the loose idea>` to chart, `/wayfinder .scratch/<effort>/map.md` to work
it, one ticket per session.

## Feeding decisions back

Nothing is done when the code works. Every resolved ticket lands somewhere:

- architecture or scope change → edit `blind-flange.html`, republish **with `url` set** to
  the artifact link in `HANDOFF.md`, or you create a duplicate artifact
- a new term → `CONTEXT.md`
- a hard-to-reverse decision → `docs/adr/`, next number in sequence
- anything a future session must not reopen → `HANDOFF.md`

ADR-0001 and ADR-0002 are not yet reflected in `blind-flange.html`. Fold them in next time
you touch it.
