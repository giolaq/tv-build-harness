# TODOS

## Pre-implementation spikes (before day 1)

- [ ] **Vega SDK on M-series Mac** — Test whether the Vega SDK CLI (`kepler` commands) runs on Apple Silicon. If it doesn't, remove `firetv-vega` from `PlatformSchema` and drop phase 6 (Vega build) from V1_PHASES. Context: the design doc lists this as a load-bearing open question. Without a working SDK, the platform is dead weight in the type system.

- [ ] **Maestro D-pad on Android TV emulator** — Run `maestro test` with a YAML flow that sends D-pad events to an Android TV emulator. If it doesn't work, the fallback is `adb shell input keyevent` (DPAD_RIGHT=22, DPAD_DOWN=20, DPAD_CENTER=23). Context: Maestro is the preferred abstraction for D-pad replay but may not support TV emulator targets.

- [ ] **Expo TV prebuild wall-clock time** — Run `EXPO_TV=1 expo prebuild --platform android` and `EXPO_TV=1 expo prebuild --platform ios` on the AmazonAppDev template with warm cache. Measure time. If both exceed 10 minutes each, parallel execution is mandatory (not optional) for the 15-min target.

## Completed (v1)

- [x] Core harness: types, orchestrator (API + Claude CLI), tool registry, skill library, run log
- [x] Shell escaping fix: pass prompts via stdin
- [x] Plan phase abort on failure
- [x] Phase output verification (branding, wiring)
- [x] Discovery-first phase instructions (read → edit in-place → verify)
- [x] Retry logic in claude-run mode (max_retries_per_phase)
- [x] Skill-management tools (request_skill_load, list_skills, write_auto_skill)
- [x] spec.json output in both modes
- [x] report.md generation in both modes
- [x] Recorder integration (API mode records, replay command consumes)
- [x] screens + navigation phases
- [x] verify phase (tsc + lint + focus)
- [x] git_commit tool + auto-commit after each successful phase
- [x] add_screen / remove_screen API-mode tools
- [x] install_dep tool (monorepo-aware yarn workspace add)
- [x] run_focus_check tool (static focus lint)
- [x] Screenshot comparison HTML report (screenshots.html)
- [x] Token cost reporting (estimated cost in report.md)

## Completed (v2 foundation — see IMPROVEMENT_PLAN.md)

- [x] **M1: Unified pipeline engine** — `pipeline-engine.ts` owns ordering, dependency blocking, retry-with-context, plan abort, resume; both orchestrators are now thin executors behind it. Fully unit-tested with a fake executor (no model needed).
- [x] **M1: Declarative phases** — `harness-config.ts`: the whole pipeline (prompts, skills, deps, models, timeouts, verify checks) is a `PhaseSpec[]` data structure; the built-in TV pipeline is just the default config.
- [x] **M1: Declarative verification** — `verification.ts`: file_exists / grep / git_dirty / tsc / focus_check / command checks with `{{var}}` substitution, configured per phase.
- [x] **M2: Checkpoint & resume** — `checkpoint.json` after every successful phase; `claude-run --resume [runId]` and `--from-phase <name>`.
- [x] **M2: Friendly input validation** — field-level Zod errors for all input files before the run starts; preflight checks for the Claude CLI (claude-run) and API key (run).
- [x] **M2: doctor --fix** — exact fix command per failing check; mode-aware (API key optional when Claude CLI present); Claude CLI check added.
- [x] **M2: Root README** — quickstart, config reference, command table, harness philosophy.
- [x] **M3: harness.config.json** — bring-your-own template repo/branch, per-phase skill lists, model routing (plan/execution + per-phase override), token budget, custom phases with insertAfter and project-local prompt files.
- [x] **M4 (partial): Real cost reporting in claude-run** — token usage + total cost from the CLI's stream-json output now in report.md.

## Post-implementation (v2)

- [ ] **Self-improving skill library** — After 5+ tool calls on a novel sub-problem, auto-extract a new skill file to `./skills/auto/`. Requires: quality gate (500+ chars, anti-pattern section, code example), name uniqueness check, integration into index.

- [ ] **EAS Build + store submission** — Phases 12-13. Signed .ipa/.apk artifacts. Requires: EAS CLI auth, provisioning profiles, signing keys.

- [ ] **Vision-model screenshot review** — Pass screenshots to a vision model with "does this look like a working TV app?" prompt. Flag focus rings, empty states, overlapping text.

- [ ] **Maestro D-pad smoke test flows** — Generate YAML flows that D-pad through every screen, capture PNGs, verify no blank screens.
