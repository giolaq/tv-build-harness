# Lessons Learned

## 1. Shell escaping breaks real prompts

Symptom: Claude CLI phases failed or behaved strangely when prompts contained quotes, shell metacharacters, or long JSON blobs.

Root cause: Passing the prompt through a command argument made shell quoting part of the data path.

Fix: Send prompts through stdin and keep `--output-format stream-json` as a separate argv value.

File/commit: `packages/harness/src/claude-cli.ts`, `packages/harness/tests/claude-cli-executor.test.ts`, `d106fa3`.

## 2. A failed plan should abort the run

Symptom: Downstream phases could continue after the planner failed, producing work without a valid `AppSpec`.

Root cause: The pipeline treated every failed phase as recoverable work unless retries were exhausted.

Fix: Mark `plan` as `abortOnFailure`, retry it, then stop the pipeline if it still fails.

File/commit: `packages/harness/src/harness-config.ts`, `packages/harness/tests/pipeline-engine.test.ts`, `ef5d14a`.

## 3. Discovery-first prompts prevent orphan files

Symptom: Agents created parallel screens or theme files instead of editing the template files the app actually imported.

Root cause: Phase prompts asked for an outcome but did not force the agent to inspect the existing app shape first.

Fix: Phase context now pushes discover/read/edit-in-place/verify behavior, especially for screen and navigation work.

File/commit: `packages/harness/src/phase-context.ts`, `docs/archive/IMPROVEMENT_PLAN.md`.

## 4. Generated skills need a quality gate

Symptom: Auto-written notes could become vague, duplicated, or too app-specific to help future runs.

Root cause: Letting the model write memory without constraints makes the skill library noisy.

Fix: Require relevance scoring, duplicate checks, 500+ characters, gotchas or anti-patterns, and a code example.

File/commit: `packages/harness/src/phase-context.ts`, `packages/harness/src/tools/skill-tools.ts`, `docs/archive/TODOS.md`.

## 5. Lazy context beats one giant prompt

Symptom: Large all-purpose context made phases less focused and harder to debug.

Root cause: Every phase does not need every bit of TV, template, platform, and verification knowledge.

Fix: Load meta knowledge plus phase-specific skills from `PhaseSpec.skills`.

File/commit: `packages/harness/src/phase-context.ts`, `packages/harness/src/skill-library.ts`, `packages/harness/src/harness-config.ts`.

## 6. Put retry rules in one engine

Symptom: Three orchestrators had similar sequencing, retry, and report behavior, making behavior drift likely.

Root cause: Executor-specific plumbing duplicated policy that should have been deterministic.

Fix: Keep ordering, dependency blocking, retries, resume, and abort behavior in `runPipeline`; keep executors thin.

File/commit: `packages/harness/src/pipeline-engine.ts`, `packages/harness/src/executors/claude-cli.ts`, `33585c8`, `297cff6`, `1a61e7e`.

## 7. Replay turns demos into deterministic teaching

Symptom: A workshop demo depended on a live key, network health, model latency, and current model behavior.

Root cause: The harness recorded too little in CLI mode and replay was only a low-level print loop.

Fix: Record claude-run stream events to `recording.json`, then replay by file or fixture name with speed control and totals.

File/commit: `packages/harness/src/recorder.ts`, `packages/harness/src/claude-phase-executor.ts`, `packages/harness/src/index.ts`, `9a6e203`, `5e8ecde`.

## 8. Vega needs explicit preflight and budgets

Symptom: Vega runs could fail late because SDK, VDA, manifest, or Builder Tools assumptions were unchecked.

Root cause: The generic TV pipeline did not encode Vega-specific setup and performance gates.

Fix: Add Vega doctor checks, build/QA/perf phases, forbidden-import checks, and configurable Vega thresholds.

File/commit: `packages/harness/src/vega-tools.ts`, `packages/harness/src/doctor.ts`, `packages/harness/src/harness-config.ts`, `cee71ce`.

## 9. Android TV focus can double-handle D-pad events

Symptom: One D-pad press moved focus two or three positions on Android TV, while web behaved normally.

Root cause: Native focus and spatial navigation both handled the same key event; back handlers could also be registered repeatedly.

Fix: Skip native `super.onKeyDown()` for D-pad keys, gate spatial-navigation roots by drawer state, and stabilize back-handler registration.

File/commit: `docs/android-tv-double-navigation-bug.md`.

## 10. Input docs should fail on drift

Symptom: Examples gained `screens.json`, `design.json`, `run.json`, and `harness.config.json` fields faster than README prose stayed current.

Root cause: Input contracts lived in Zod schemas, while docs were handwritten separately.

Fix: Describe schema fields in code, generate `docs/inputs.md`, and make CI fail when the generated doc changes.

File/commit: `scripts/gen-input-docs.ts`, `docs/inputs.md`, `.github/workflows/ci.yml`, `921bf31`.
