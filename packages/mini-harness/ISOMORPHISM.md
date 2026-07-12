# Mini Harness Isomorphism

Step 04 keeps the same architectural names as the real harness where possible. The mini version is small enough to read in a workshop; the real version carries production concerns.

| mini module | real module path | one-line shared role | what the real one adds |
| --- | --- | --- | --- |
| `index.ts` | `packages/harness/src/index.ts` | CLI entrypoint that parses commands and starts a run. | Many subcommands, JSON contracts, detach/status/logs/abort, doctor, schema, refine, and replay UX. |
| `harness-config.ts` | `packages/harness/src/harness-config.ts` | Loads the phase plan and per-phase checks. | Template pins, model routing, platform config, custom phases, validation warnings, and defaults. |
| `pipeline-engine.ts` | `packages/harness/src/pipeline-engine.ts` | Runs phases in order with retry and verification. | Dependencies, skip/abort behavior, richer phase results, hooks, and production error handling. |
| `run-context.ts` | `packages/harness/src/run-context.ts` | Owns the run directory, files, report, cost tally, and commits. | Input snapshots, template clone, app spec finalization, budget enforcement, and multi-platform run state. |
| `phase-context.ts` | `packages/harness/src/phase-context.ts` | Assembles the prompt for one phase. | Template variables, phase-specific instructions, skill routing, stack detection, and richer run context. |
| `executor.ts` | `packages/harness/src/executors/{agent-sdk,claude-cli,strands}.ts` | Puts the model call behind an interface. | Three providers, streaming, tool use, CLI subprocess handling, usage accounting, and recording taps. |
| `checkpoint.ts` | `packages/harness/src/checkpoint.ts` | Stores enough state to resume after a phase. | Full run status, phase outcomes, generated app state, and resume edge cases. |
| `recorder.ts` | `packages/harness/src/recorder.ts` | Records and replays model turns with the shared `RecordedTurn` shape. | Pacing, full usage/cost handling, fixture replay UX, and compatibility guarantees. |
| `skills.ts` | `packages/harness/src/skill-library.ts` | Loads named markdown skills for prompt injection. | Skill inventory, stack-aware routing, frontmatter validation, auto-skills, and quality gates. |
| `verify.ts` | `packages/harness/src/verification.ts` | Runs mechanical checks after a model edit. | More check kinds, platform/build checks, screenshots, focus checks, and structured verification results. |
