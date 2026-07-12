# Changelog

## Unreleased

## v0.4.0 - 2026-07-12

### Android TV Toolchain

- Added a stack-aware Android TV adapter for Gradle compile/assemble/install, device selection, full boot detection, activity launch, ADB input, accessibility focus observation, screenshots, Logcat, and cleanup.
- Added `tv-build android <runId|appDir>` planning and execution with versioned JSON events and Android Studio handoff metadata.
- Added expected-focus D-pad flows and Android/KMP golden specifications.

### Harness Trust

- Added a bounded, redacting argument-array command runner and safe configurable command checks.
- Removed timing-sensitive network/process work from verification environment capture; all 51 verification tests are green.
- Added a repository-wide verification script and resource integrity checks.

### Workshop And Packaging

- Added the four-stage mini-harness workshop and its isomorphism guide.
- Added a synthetic full-harness replay contract fixture for deterministic key-free testing.
- Bundled built-in skills, the cooking-shows example, and replay fixture in the npm package.
- Converted the experimental web UI server into a read-only run-artifact explorer.

### Deferred

- Replace the synthetic full-harness replay contract with a scrubbed real run and add a refine fixture during a keyed session.
- Record one real Android TV emulator lifecycle with screenshots and Logcat.
- The first published pass-rate table still requires a funded fixed-size verification batch.

## v0.3.1 - 2026-07-05

### Refine Loop

- Added `tv-build refine <runId|appDir> --phase <name> "instruction"` for targeted single-phase amendments against the current app state.
- Added refine planning, JSON confirmation, default `$3` cost cap, guard-branch cleanup, report append, and course/agent guidance for the three-tempo loop model.

### Verification Governance

- Updated verification to drive the harness through the schema-versioned NDJSON contract.
- Added fixed/random seed policy, per-run and batch budget controls, budget skip records, and modern pinned environment metadata.
- Added comparison guards for model, template, seed-regime, and judge drift, with explicit confounded-comparison override.
- Added judge prompt identity and judge cost fields to rubric records.
- Added aggregate, compare, runner, rubric, and smoke tests; verification now has 50+ unit tests.

## v0.3.0 - 2026-07-05

First tagged release.

### Agent-Facing CLI

- Added schema-versioned JSON/NDJSON output for agent-driven workflows.
- Added `schema`, `validate`, `init`, `status`, `logs`, `abort`, and `templates check` flows for shell-based agents.
- Added detached runs with status/log polling and a confirmation gate for JSON-mode launches.
- Added semantic validation warnings for sparse rails, navigation depth, contrast, missing prompts, and non-HTTPS URLs.
- Added `AGENTS.md` and lesson 07 as the consumer-facing agent authoring guide.

### Hardening And Trust

- Added explicit creative seed control for repeatable runs and fixtures.
- Added max-cost caps with clean budget aborts and resumable checkpoints.
- Required pinned template commit SHAs and added `templates check`.
- Replaced real-world/owner-hosted example content with synthetic committed examples.
- Added weekly example link hygiene, owner-domain guards, and generic scrub checks for docs/examples.

### Course And Docs

- Added course lesson 07 and an agent-driving demo scaffold.
- Updated input docs from schemas and README usage for agent-driven workflows.

### Deferred

- Full-harness replay fixture and nightly golden run still require a key-backed recorded run.
- The live agent demo transcript and final report are deferred until a key-backed run is available.
