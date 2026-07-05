# Changelog

## Unreleased

### Deferred

- Full-harness replay fixture, refine fixture, and live agent demo still require a key-backed recorded run.
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
