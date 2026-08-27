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

Generated with:

```bash
find skills -maxdepth 2 -name SKILL.md | sort
```

| Skill | Loaded for | File |
|-------|------------|------|
| `10ft-ui` | `[phase_screens]` | `skills/10ft-ui/SKILL.md` |
| `android-tv-testing` | `[android_test_loop]` | `skills/android-tv-testing/SKILL.md` |
| `amazon-devices-vega-app-performance` | `[vega_perf_trace, vega_hot_functions]` | `skills/amazon-devices-vega-app-performance/SKILL.md` |
| `amazon-devices-vega-best-practices` | `[vega_setup_check, vega_qa_loop]` | `skills/amazon-devices-vega-best-practices/SKILL.md` |
| `amazon-devices-vega-setup-sdk` | `[vega_setup_check]` | `skills/amazon-devices-vega-setup-sdk/SKILL.md` |
| `creative-tv-ui` | `[creative_ui]` | `skills/creative-tv-ui/SKILL.md` |
| `eas-build` | `[phase_eas_build]` | `skills/eas-build/SKILL.md` |
| `expo-tv-config` | `[phase_clone, phase_prebuild]` | `skills/expo-tv-config/SKILL.md` |
| `firetv-leanback` | `[phase_brand, phase_build]` | `skills/firetv-leanback/SKILL.md` |
| `kmp-build-commands` | `[scaffold, screens, branding, content]` | `skills/kmp-build-commands/SKILL.md` |
| `kmp-compose-tv` | `[screens, content, scaffold]` | `skills/kmp-compose-tv/SKILL.md` |
| `kmp-data-layer` | `[content, scaffold, screens]` | `skills/kmp-data-layer/SKILL.md` |
| `kmp-navigation` | `[screens, scaffold]` | `skills/kmp-navigation/SKILL.md` |
| `kmp-template-anatomy` | `[scaffold, branding, content, screens]` | `skills/kmp-template-anatomy/SKILL.md` |
| `kmp-theming` | `[branding, screens]` | `skills/kmp-theming/SKILL.md` |
| `kmp-verify-patterns` | `[scaffold, screens, branding, content]` | `skills/kmp-verify-patterns/SKILL.md` |
| `meta` | `[all]` | `skills/meta/SKILL.md` |
| `rn-manifest-wiring` | `[phase_manifest, phase_screens]` | `skills/rn-manifest-wiring/SKILL.md` |
| `rn-shared-ui-catalog` | `[phase_screens, phase_navigation]` | `skills/rn-shared-ui-catalog/SKILL.md` |
| `rn-spatial-navigation` | `[phase_screens, phase_static_check]` | `skills/rn-spatial-navigation/SKILL.md` |
| `rn-template-anatomy` | `[phase_clone, phase_brand, phase_manifest, phase_screens, phase_build]` | `skills/rn-template-anatomy/SKILL.md` |
| `rn-theming` | `[phase_brand]` | `skills/rn-theming/SKILL.md` |
| `vega-sdk` | `[phase_vega_build]` | `skills/vega-sdk/SKILL.md` |
| `video-player` | `[phase_screens, phase_manifest]` | `skills/video-player/SKILL.md` |

## Auto-skills

Validated skill candidates live in `./auto/`. The `write_auto_skill` tool accepts only safe kebab-case names, valid phase scopes, substantive guidance, a Gotchas or Anti-pattern section, and a code example. Accepted candidates are indexed immediately and load only for matching phases. Review them manually before promoting, merging, or deleting them; the harness does not yet track recurrence or effectiveness.
