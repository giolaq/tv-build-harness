# Skills

> Fat skills, thin harness. Following Garry Tan's paradigm: the harness only runs the model in a loop, reads/writes files, manages context, and enforces safety. Everything else — judgment, processes, decision-making, platform knowledge — lives here.

## Convention

Each skill is a markdown file. The harness loads relevant skills into the model's context **lazily** — only when their phase or trigger matches. This keeps context tight and lets skills be arbitrarily fat without paying a token cost on every turn.

### Frontmatter

```yaml
---
name: skill-name
applies_to: [phase_clone, phase_brand, phase_screens, phase_build, ...]
load_when: short trigger description
---
```

`applies_to` controls automatic loading by phase. `load_when` is for human readers; the orchestrator can also load skills opportunistically (e.g. on error keywords).

### What goes in a skill

- **Judgment, not just code.** A skill answers "how do I decide what to do here," not "here is one snippet to paste."
- **Decision trees.** When this, do that. When that, prefer the other.
- **Anti-patterns.** What not to do, with the reason — this is often more valuable than the positive guidance.
- **Self-contained context.** The agent should be able to load just this file and solve the class of problems it covers, without pulling in three others.
- **Concrete patterns and gotchas.** Specific to *this* template, *this* stack. Generic React Native advice belongs in the model's weights, not here.

### What does NOT go in a skill

- Code generators or templating logic. That's a tool.
- One-off facts. If used once, inline it. Codify only the repeated.
- Restatements of upstream docs. Link out; don't mirror.

## Inventory

| Skill | Loaded for |
|-------|-----------|
| `template-anatomy.md` | Anything that touches files |
| `shared-ui-catalog.md` | Screen customization, add/remove screen |
| `theming.md` | Brand application phase |
| `manifest-wiring.md` | Content injection phase |
| `spatial-navigation.md` | New screen generation, focus-check failures |
| `vega-sdk.md` | Vega target build phase |
| `firetv-leanback.md` | Fire OS / Android TV build phase |
| `expo-tv-config.md` | Prebuild phase |
| `video-player.md` | Player screen customization |
| `eas-build.md` | EAS Build phase |
| `10ft-ui.md` | New screen generation (not template reuse) |

## Auto-skills

Skills the harness writes itself live in `./auto/`. Triggered after ≥ 5 tool calls on a novel sub-problem: the orchestrator summarizes the resolution into a new `SKILL.md` and saves it. Future runs load it like any other skill.
