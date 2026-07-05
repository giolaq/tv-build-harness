# Changelog

## v0.3.0 - 2026-07-05

This will be the first tagged release.

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
