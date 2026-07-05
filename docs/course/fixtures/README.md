# Course Fixtures

Full-harness fixtures live under `docs/course/fixtures/<name>/recording.json` when a key-backed run is available. None are committed yet.

Mini-harness fixtures live in `packages/mini-harness/fixtures/` and replay in CI.

Regenerate affected fixtures whenever a PR changes `packages/harness/prompts/`, `packages/harness/src/harness-config.ts`, phase behavior, or recording/replay shape. If regeneration needs a key, mark the PR checkbox as deferred with `[deferred: needs key]`.
