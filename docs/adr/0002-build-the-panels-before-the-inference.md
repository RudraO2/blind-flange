# Build the panels before the inference

The internal hackathon round is judged on a short live impression against problem
statements with visually obvious outputs (drift maps, icebergs), and the question that
kills this project is "why not just Ollama with Open WebUI?". Every one of Blind Flange's
differentiators — the routing explainer with live classifier scores, provenance crops,
the egress monitor and canary, the fan-out gauge, the `.docx` deliverable factory — sits
in the harness and the frontend and needs no large model to work. So Phase 0 builds those
panels first and treats inference as a swappable dependency behind ADR-0001, rather than
building a chat box and adding panels later.

## Consequences

The answer to "why not Open WebUI?" becomes a demo beat instead of an argument: open the
routing panel, click a provenance crop, press the canary. None exist off-the-shelf. This
is the same reasoning already recorded as a closed decision in `HANDOFF.md` (own thin
frontend, not Open WebUI); this ADR extends it to build *order*, not just build *choice*.

The risk is a beautiful shell with nothing behind it. The guard is that the harness
orchestration must be real from day one — real sub-agents, real tool calls, real document
generation, real firewall — with only the token generation swappable. A panel that
animates without a real event behind it is a bug, not a shortcut.
