# TV App Harness — Improvement Plan (Updated 2026-06-23)

Goal: a production-quality, multi-provider AI harness that generates TV apps from any template, with statistical quality measurement, and serves as the canonical example for "how to build a harness for your task."

---

## 1. What's been built (completed work)

### Foundation (M1) — DONE

| Item | What was built |
|---|---|
| Unified pipeline engine | `pipeline-engine.ts` — phase ordering, deps, retry-with-context, abort, budget guard, resume |
| Declarative phases | `PhaseSpec` in `harness-config.ts` — name, skills, model, verify checks, retries, timeouts |
| Two executors | `claude-orchestrator.ts` (CLI), `strands-orchestrator.ts` (Strands SDK) |
| Pluggable templates | `template.repo` + `template.branch` in config |
| Checkpoint & resume | `checkpoint.json`, `--resume [runId]`, `--from-phase <name>` |

### Developer experience (M2) — DONE

| Item | What was built |
|---|---|
| README | Full public-facing README with architecture, quickstart, TUI screenshot |
| CLI | `tv-harness` bin entry, all commands working |
| Doctor | `doctor.ts` with pre-flight checks and fix suggestions |
| Input validation | Zod schemas validate all inputs before pipeline starts |
| TUI | Ink-based terminal UI with phase progress, detail views, token/cost display |

### Multi-provider (new, not in original plan)

| Item | What was built |
|---|---|
| Strands Agents SDK | `strands-orchestrator.ts` — full replacement for the API mode |
| Provider factory | `model-factory.ts` — Bedrock, Anthropic, OpenRouter, OpenAI |
| Per-phase model override | `phaseModels` config — use different models per phase |
| Skills as Strands plugins | `AgentSkills` with progressive disclosure (on-demand loading) |
| Generic tools | bash, read_file, write_file, edit_file, list_files, git, grep |
| OpenRouter compatibility | Patched fetch for numeric error codes, token tracking via interceptor |

### Customizability (M3) — DONE

| Item | What was built |
|---|---|
| `harness.config.json` | Fully overridable: phases, skills, template, models, budgets |
| Skill packs (basic) | `install-skills`, `update-skills`, `prune-skills`, `consolidate-skills` commands |
| Model routing | Per-phase model override via `phaseModels` config |
| Skills directory format | Strands convention (`skills/*/SKILL.md`) with descriptions |

### Visual QA & testing (M4 partial)

| Item | What was built |
|---|---|
| Vision-model QA | `visual-qa.ts` — serve web, screenshot, grade against 10ft rubric, fix, repeat |
| Chrome auto-launch | Detects if Chrome with remote debugging is running; launches if not |
| eval.json | Capture step writes expected state per screenshot for precise QA |
| Android test loop | D-pad navigation testing on emulator via `android_test_loop` phase |
| Devtools MCP | Screenshots via chrome-devtools MCP with fallback to Puppeteer |

### Verification system (new, not in original plan)

| Item | What was built |
|---|---|
| Statistical suite | `packages/verification/` — rates over N runs with 95% Wilson CIs |
| 5 verification levels | Structural, build, smoke, content fidelity, LLM-judge rubric |
| 8 golden specs | GS-01 through GS-08 (easy → hard, covering all examples) |
| Comparison engine | Two-proportion z-test, Fisher's exact, Holm correction, regression rule |
| Verification TUI | Beautiful terminal output with progress, results, summary table |
| Runner | N-repeat with infra_error retry, tier-based depth, secret scrubbing |

### Creative UI diversity (new, not in original plan)

| Item | What was built |
|---|---|
| Per-content-type personalities | Sports=angular, cooking=warm, music=neon, fitness=athletic, etc. |
| Enhanced prompts | `creative_ui.md` rewritten for visual signatures, atmospheric components |
| Design token expansion | `mood`, `surface_style`, `card_style`, expanded `focus_style` |
| Branding depth | Derives full surface hierarchy (background ≠ surface ≠ card) |

### Bugs found & fixed

| Bug | Root cause | Fix |
|---|---|---|
| Android TV double navigation | `addKeydownListener` returning cleanup fn instead of listener | Verify step in `verify.md` + rule in `screens.md` |
| Duplicate react-tv-space-navigation | Agent adds to `shared-ui/devDeps` → Metro bundles two copies | Metro blockList + scaffold cleanup step |
| RTL drawer on emulator | Emulator locale set to RTL | Documented (not forced — user preference) |

---

## 2. What remains (prioritized)

### P0 — Ship-blocking (fix before sharing widely)

| Item | Why | Effort (CC) |
|---|---|---|
| **OpenRouter token/cost tracking** | TUI shows 0/0 for tokens and cost with OpenRouter models. The Strands SDK doesn't propagate OpenAI usage to `agentResult.metrics`. Need to extract from SSE stream `[DONE]` chunk or response headers. | ~30 min |
| **Streaming response for OpenRouter** | Strands SDK crashes on `reasoning_details` field from some models (GLM-5.2). Need to strip non-standard fields or handle gracefully. | ~30 min |
| **Remove debug `metrics-*.json` writes** | Debug code left in `strands-orchestrator.ts` that writes metrics files | 5 min |

### P1 — High value, pre-talk

| Item | Why | Effort (CC) |
|---|---|---|
| **Unit test pipeline engine** | Most critical untested code. Fake executor: retry paths, verify failure → retry, plan abort, budget exhaustion, resume. | ~1 hr |
| **CI workflow (GitHub Actions)** | Wire verification suite into CI: `verify run --spec=GS-01-simple` on PRs (fast, N=1), full suite on nightly. | ~30 min |
| **Extract shared orchestrator logic** | `strands-orchestrator.ts` and `claude-orchestrator.ts` duplicate: `getMaxTurns`, `executeClonePhase`, plan prompt, report writing. Extract to `orchestrator-base.ts`. | ~1 hr |
| **Strands SDK streaming token tracking** | For streaming (SSE) responses, parse the final `data: [DONE]` chunk which contains `usage`. Currently only non-streaming responses are tracked. | ~45 min |

### P2 — Nice to have, post-talk

| Item | Why | Effort (CC) |
|---|---|---|
| **Hooks (`prePhase`/`postPhase`)** | `"hooks": { "postBranding": "npx lint-colors" }` in config. Pipeline is closed; hooks open it for custom validation without code changes. | ~1 hr |
| **Structured phase outputs** | Each phase ends with a machine-checkable claim (files changed, checks passed) not just prose. Currently only `plan` validates output. | ~2 hr |
| **Screenshot baseline diffing** | Store baseline screenshots per golden spec; `verify diff <runA> <runB>` produces side-by-side HTML. Extends existing screenshots.html. | ~2 hr |
| **Maestro D-pad flows** | Generate YAML from AppSpec (one flow per screen). Falls back to `adb shell input keyevent`. Replaces the ad-hoc `android_test_loop`. | ~3 hr |
| **Remote content source example** | Add an example with `content_url` that fetches from an API. Shows real-world wiring beyond static JSON. | ~30 min |
| **`create-tv-app` wizard** | `npx create-tv-app my-app` — prompts for content source, brand colors, platforms, emits the input directory. | ~2 hr |

### P3 — Maintenance / cleanup

| Item | Why | Effort |
|---|---|---|
| Remove tool duplication between orchestrators | `strands-tools.ts` handler logic duplicated from `orchestrator.ts` MCP tools | ~1 hr |
| Remove old `orchestrator.ts` (API mode v1) | Replaced by `strands-orchestrator.ts` — dead code | 5 min |
| Clean `IMPROVEMENT_PLAN.md` from repo before public | Internal planning doc; replace with CONTRIBUTING.md | 5 min |
| Resolve `feat/creative-ui-diversity` branch | Still unmerged; merge or cherry-pick the prompt/design changes | 10 min |

---

## 3. Architecture (current state)

```
┌──────────────────────────────────────────────────────────────┐
│                    harness.config.json                         │
│  template, models, phases[], tokenBudget, phaseModels         │
└─────────────────────────────┬────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │       Pipeline Engine          │
              │  (deps, retry, abort, resume)  │
              └───────┬───────────────┬───────┘
                      │               │
         ┌────────────┴──┐    ┌───────┴────────────┐
         │ Claude CLI     │    │ Strands SDK         │
         │ Executor       │    │ Executor            │
         │ (claude -p)    │    │ (Agent + tools)     │
         └────────────────┘    └───────┬────────────┘
                                       │
                        ┌──────────────┼──────────────┐
                        │              │              │
                   BedrockModel   AnthropicModel  OpenAIModel
                                                  (OpenRouter)
```

```
skills/                    → Domain knowledge (Strands SKILL.md format)
packages/harness/prompts/  → Phase instructions (markdown templates)
packages/verification/     → Statistical quality measurement
packages/shared-types/     → Types shared across packages
examples/                  → Working input examples (4)
```

---

## 4. The talk: "How to build your harness for your task"

### Updated narrative arc

**1. The hook** — "just prompt it" fails. Show the failure: plausible code that doesn't compile, orphan files, wrong paths. The model creates new files instead of editing existing ones.

**2. The thesis** — a harness is deterministic structure around a stochastic worker. 80% template + 20% LLM judgment. The LLM never does work that `git clone` can do.

**3. The five ingredients:**

| Ingredient | In this repo |
|---|---|
| Strong prior | Template clone in `scaffold` phase |
| Decomposition | `DEFAULT_PHASES` in config, `prompts/*.md` |
| Knowledge injection | `skills/*/SKILL.md` + AgentSkills plugin (progressive disclosure) |
| Verification | Per-phase checks + `packages/verification/` (Wilson CIs) |
| Observability | NDJSON run.log, git commit per phase, TUI, report.md |

**4. The multi-provider story (NEW)** — same harness, swap the model. Show: configure GLM-5.2, Claude Sonnet, DeepSeek via OpenRouter — config change, not code change. Compare outputs. Which model writes better TV apps?

**5. The verification story (NEW)** — "how do you know the harness works?" Show: `verify run --spec=all` → Wilson CIs → regression detection. The verifier caught a real bug (RemoteControlManager return type). Statistical rigor, not vibes.

**6. Lessons learned:**
- Discovery-first prompting (find → read → edit-in-place → verify)
- Skills beat mega-prompts (lazy loading, progressive disclosure)
- Abort on plan failure, degrade on everything else
- Per-phase git commits as audit trail
- The model is the easy part — the harness is where engineering goes

**7. Generalization recipe:**
1. What's your proven starting point?
2. What's the smallest sequence of single-responsibility steps?
3. What does the model not know? → write skill files
4. How do you mechanically verify each step?
5. How do you measure quality over time? → verification suite

**8. Live demo options:**
- Full run with TUI (risky, ~15 min with fast model)
- Replay a recording
- Artifact tour: git log, report.md, screenshots, verification results
- Provider swap: change one line in config, run again with a different model

---

## 5. Definition of "amazing" (updated)

- A newcomer goes from `npx` to a buildable, branded TV app in under 15 minutes without reading source.
- Adapting the harness to a different template or pipeline requires editing config and markdown only — zero TypeScript.
- Swap the LLM provider (Bedrock → OpenRouter → direct Anthropic) with one config change.
- Every run is resumable, replayable, and explainable from its artifacts.
- Quality is measured statistically (Wilson CIs), not with a single pass/fail.
- The repo doubles as the canonical worked example for "build a harness for your task."
