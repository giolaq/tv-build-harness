# TV App Harness — Improvement Plan

Goal: turn the harness from a working v1 prototype into a tool TV-app developers can pick up, run out of the box, and customize for their own templates, platforms, and pipelines — and use it as the flagship example for the talk **"How to build your harness for your task."**

---

## 1. Where the project stands today

**What's genuinely good (keep and showcase):**
- The core idea is right: 80% deterministic (proven template) + 20% LLM (branding, wiring, planning), driven through sequential, individually-verified phases.
- Skills as markdown knowledge files, lazily loaded per phase (`skill-library.ts` → `PHASE_SKILL_MAP`), with on-demand loading and auto-skill creation with a quality gate.
- Per-phase verification + retry with error context, plan-phase abort, auto-commit per phase (git history *is* the audit trail).
- NDJSON run log, recorder/replay, `doctor` preflight, token budget, report.md, screenshots.html.
- The "discovery-first" prompt pattern (discover → read → edit-in-place → verify) that fixed the orphan-file failure mode.

**What holds it back:**

| Problem | Evidence |
|---|---|
| Two orchestrators duplicating the pipeline | `claude-orchestrator.ts` (1,298 lines) and `orchestrator.ts` (774 lines) each own phase sequencing, retry, verification, reporting |
| Everything is hardcoded | Phases in `types.ts:5`, skill mapping in `skill-library.ts:5`, instructions inside the orchestrator, template URL in `clone-template.ts` — adapting to a new template means editing 4+ source files |
| Not installable | No root README, runs via `npx tsx src/index.ts`, not published, no `create-*` entry point |
| No resume | A failure at phase 7 of 10 means rerunning ~15 minutes from scratch; phases already auto-commit, but nothing reads that state back |
| Orchestration untested | Tests cover types, run-log, skill-library, tool-registry — not phase sequencing, retry, or verification logic |
| Verification is shallow at the end | visual_qa exists, but vision-model review, Maestro D-pad flows, and screenshot diffing are still TODOs |

---

## 2. North star

```bash
npx create-tv-app my-app        # wizard: content source, brand, platforms
cd my-app && tv-harness run     # 10–15 min later: buildable app + report + screenshots
tv-harness run --resume         # picks up from last good phase
```

And for the customizer:

```jsonc
// harness.config.json — the whole pipeline is data, not code
{
  "template": { "repo": "github:AmazonAppDev/react-native-multi-tv-app-sample" },
  "phases": [
    { "name": "branding", "prompt": "prompts/branding.md",
      "skills": ["template-anatomy", "theming"],
      "verify": { "grep": "{{brand.primaryColor}}" }, "retries": 5 }
  ]
}
```

---

## 3. The plan, by theme

### Theme A — One engine, declarative pipeline (the foundation)

**A1. Unify the two orchestrators.** Extract a single `PipelineEngine` that owns: phase iteration, retry-with-context, verification, run-log, budget, reporting, auto-commit. The two modes become thin *executors* behind one interface:
`ClaudeCliExecutor` (spawn `claude -p`) and `ApiExecutor` (Messages API + tool loop). ~40% code reduction, and every later feature lands once instead of twice.

**A2. Make phases data, not code.** A `PhaseSpec` object: `{ name, promptFile, skills, model, verify, retries, runWhen }`. The built-in TV pipeline becomes the *default config*, loaded from `harness.config.json` if present. `PHASE_SKILL_MAP`, `PHASE_INSTRUCTIONS`, and `V1_PHASES` all collapse into this one structure. Verification becomes a small library of declarative checks (`fileExists`, `grep`, `tsc`, `command`) plus an escape hatch for custom JS.

**A3. Pluggable templates.** Template = `{ repoUrl, ref, anatomySkill, postCloneSteps }` in config. Ship the Amazon template as the default; document "bring your own template" as: point at your repo + write one `template-anatomy.md`. This is the single highest-leverage customization story — it converts the harness from "generates one app" to "generates apps from *your* starting point."

**A4. Checkpoint & resume.** The per-phase git commits already exist; add a `checkpoint.json` (`{ runId, completedPhases, spec }`) written after each phase, and `--resume [runId]` / `--from-phase <name>` flags. Cheap to build, transforms the iteration experience.

### Theme B — Works out of the box (DX)

**B1. Root README + quickstart.** The repo has excellent internal docs (ARCHITECTURE.md, FEATURES.md) and no front door. README with: 60-second pitch, GIF of the TUI, quickstart, architecture diagram, "customize it" section.

**B2. Real CLI.** Bin entry (`tv-harness`), publish to npm, `npx tv-harness run --example cooking-shows` with zero clone. Later: `create-tv-app` wizard (prompts for content source, brand colors, platforms; emits the input directory).

**B3. Doctor that fixes.** `doctor` already detects; add `doctor --fix` (install missing CLIs where safe, create an Android TV AVD, suggest exact commands otherwise) and run a fast doctor subset automatically before every `run`.

**B4. First-run honesty.** Detect missing `claude` CLI / `ANTHROPIC_API_KEY` up front with a one-line fix, validate input JSON against Zod schemas *before* the run starts and print friendly field-level errors (today bad content.json can fail mid-pipeline).

**B5. Progress you can trust.** The TUI (`tui.tsx`) exists; make it default: phase checklist, current phase elapsed time, token spend, tail of the agent's activity, final artifact paths. `--quiet` for CI.

### Theme C — Customizability (the "your task" in the talk title)

**C1. `harness.config.json`** (from A2/A3) — phases, skills, template, models, budgets all overridable per project.

**C2. Skill packs.** Skills already support local / remote / auto tiers. Formalize: `tv-harness skills add github:org/repo` installs a pack; packs declare `applies_to` phases in frontmatter so they slot into the pipeline without config edits. Ship the existing 12 skills as the built-in "react-native-tv" pack.

**C3. Hooks.** `prePhase` / `postPhase` / `onFailure` commands in config (e.g. run your own linter after `screens`, post to Slack on failure). Keeps the engine closed, the pipeline open.

**C4. Model routing in config.** Today Opus-for-plan/Sonnet-for-execution is hardcoded; make per-phase `model` a config field with those defaults.

### Theme D — Robustness & trust

**D1. Test the engine.** Unit-test `PipelineEngine` with a fake executor: retry paths, verification failure → degraded → retry, plan abort, budget exhaustion, resume. This is the highest-value untested code in the repo.

**D2. Golden-run e2e in CI.** Nightly: `claude-run --example cooking-shows --generate-only`, assert `tsc` passes and expected files exist. Catches prompt/skill regressions — the failure class unit tests can't see.

**D3. Structured outputs.** Plan phase already Zod-validates AppSpec; extend the pattern so every phase ends with a machine-checkable claim (files changed list, checks passed) rather than prose.

**D4. Cost accuracy.** Parse the claude CLI's JSON output (`--output-format json`) to get real token counts in claude-run mode instead of "not visible to the harness".

### Theme E — Close the verification loop (the demo "wow")

**E1. Vision-model visual QA.** The visual_qa_loop captures screenshots; send them to Claude with the `10ft-ui.md` rubric ("focus ring visible? text inside safe area? contrast?") and feed defects back as fix tasks. Already a v2 TODO — it's also the single best live-demo moment for the talk.

**E2. Maestro D-pad smoke flows.** Generate a YAML flow per screen from the AppSpec (D-pad through every focusable, screenshot, assert non-blank). Falls back to `adb shell input keyevent` per the existing spike note in TODOS.md.

**E3. Screenshot baseline diffing.** Store screenshots per run; `tv-harness diff <runA> <runB>` produces a side-by-side HTML report (extend the existing screenshots.html generator).

### Theme F — Reach

**F1. More examples** — keep the four (cooking, music, fitness, sports), add one with a *remote* content source (fetch JSON from a URL) to show real-world wiring.
**F2. Demo video / GIF** for README and the talk, built from the recorder + replay infrastructure you already have.
**F3. Docs site later** — README + ARCHITECTURE is enough until after the talk.

---

## 4. Prioritized roadmap

| Milestone | Contents | Effort | Why this order |
|---|---|---|---|
| **M1 — Foundation** | A1 unify engine, A2 declarative phases, D1 engine tests | ~3–4 days | Everything else lands on this; do it first or pay twice |
| **M2 — Out of the box** | B1 README, B2 bin + npm, B4 input validation, A4 resume, B3 doctor --fix | ~2–3 days | The "works out of the box" promise; demo-critical |
| **M3 — Customizable** | A3 templates, C1 config, C2 skill packs, C4 model routing | ~2–3 days | The "for your task" promise; second half of the talk |
| **M4 — Wow** | E1 vision QA, B5 TUI polish, D4 real token costs, F2 demo video | ~2–3 days | Demo moments + credibility numbers |
| **M5 — Post-talk** | E2 Maestro, E3 diffing, C3 hooks, D2 CI golden run, create-tv-app wizard | ongoing | Valuable, not presentation-blocking |

Housekeeping (do anytime, 30 min): remove committed `video/.thumbnails/` and `.DS_Store` artifacts, resolve the deleted `package-lock.json` vs `yarn.lock` situation, fold AGENTS.md/TODOS.md status into the README.

---

## 5. The talk: "How to build your harness for your task"

This project is a near-perfect teaching vehicle because every harness concept exists in it as a concrete file you can put on a slide.

### Suggested narrative arc

**1. The hook — why "just prompt it" fails.**
Open with the failure mode: ask an LLM to "build me a TV app" and you get plausible code that doesn't compile, orphan files nothing imports, wrong monorepo paths. Your war story: Claude kept creating *new* files instead of editing existing ones — the app looked untouched. That's not a model problem, it's a *harness* problem.

**2. The thesis — a harness is deterministic structure around a stochastic worker.**
The 80/20 split (ARCHITECTURE.md line 14): 80% proven template, 20% LLM judgment. The LLM never does work that a `git clone` can do.

**3. The five ingredients** (each maps to a file in this repo):

| Ingredient | What it does | In this repo |
|---|---|---|
| **Strong prior** | Start from something that already works; the LLM customizes, never invents | template clone in `scaffold` phase |
| **Decomposition** | Small phases with one job each, not one giant prompt | `V1_PHASES` in `types.ts`, `prompts/*.md` |
| **Knowledge injection** | Domain facts the model won't reliably know, loaded only when relevant | `skills/*.md` + `PHASE_SKILL_MAP` |
| **Verification** | Every phase ends with a machine check; failure feeds back as context | grep/tsc checks, retry-with-error-context, plan abort |
| **Observability** | You can't improve what you can't replay | NDJSON run.log, recorder/replay, auto-commit per phase, report.md |

**4. The lessons-learned section (the part audiences remember).** Each is a real fix in your TODOS.md "Completed" list:
- *Discovery-first prompting* — force "find → read → edit-in-place → verify" or the model writes parallel files (the orphan-file bug).
- *Pass prompts via stdin* — shell escaping will eventually eat a prompt containing quotes.
- *Abort on plan failure, degrade on everything else* — know which phases are load-bearing.
- *Auto-commit per phase* — `git log` of the generated app reads as a build narrative; bisect a bad run like bad code.
- *Skills beat fine-tuning and beat mega-prompts* — markdown files are diffable, reviewable, and the agent can even write its own (`write_auto_skill` with a quality gate: ≥500 chars, a Gotchas section, a code example — yes, you quality-gate the AI's notes to itself).
- *Lazy context* — load per-phase skills, not everything; focused context outperforms big context.

**5. The generalization recipe — "now do it for YOUR task."** Give the audience the worksheet:
1. What's your proven starting point? (template / boilerplate / golden example)
2. What's the smallest sequence of single-responsibility steps?
3. What does the model not know about your domain? → write it as skill files
4. How do you *mechanically* verify each step? (compile, grep, test, screenshot)
5. What do you log so you can replay and improve?
Then show that in this codebase the recipe is literally a config file (post-M3): swap the template URL, swap the skills, swap the phases — same engine, different task.

**6. Live demo options** (have all three; pick by time):
- *Full run* (risky, 10–15 min): start `claude-run --example cooking-shows` at talk start, return to it at the end.
- *Replay* (safe): `replay out/<runId>/recording.json` — turn-by-turn with token counts, narrate the phases. This is what the recorder was built for.
- *Artifact tour* (zero risk): walk `out/<runId>/` — git log of phases, report.md, screenshots.html before/after visual QA.

**7. Closing slide.** "The model is the easy part. The harness — priors, decomposition, knowledge, verification, observability — is where your engineering goes." Repo link.

### Slide-to-repo cheat sheet

| Slide | Show this |
|---|---|
| Pipeline diagram | ARCHITECTURE.md ASCII pipeline (lines 32–38) |
| One phase anatomy | `prompts/branding.md` + its `PHASE_SKILL_MAP` entry + its verify check |
| A skill file | `skills/spatial-navigation.md` (concrete, domain-y, obviously not in training data) |
| Verification loop | FEATURES.md phase-verification table |
| Audit trail | `git log --oneline` inside a generated `out/<runId>/app` |
| Self-improvement | `write_auto_skill` quality gate in `tools/skill-tools.ts` |

---

## 6. Definition of "amazing"

- A newcomer goes from `npx` to a buildable, branded TV app in under 15 minutes without reading source.
- Adapting the harness to a different template or a different pipeline requires editing **config and markdown only** — zero TypeScript.
- Every run is resumable, replayable, and explainable from its artifacts.
- The repo doubles as the canonical worked example for "build a harness for your task."
