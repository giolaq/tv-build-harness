# Mini Harness

This package is a small teaching harness. It shows the harness loop without the production TV app machinery.

Run the zero-key fixture:

```sh
yarn install
yarn dev --phases fixtures/phases.json --replay fixtures/demo-recording.json
```

Run live with Anthropic:

```sh
ANTHROPIC_API_KEY=... yarn dev --phases fixtures/phases.json
```

The harness loads `phases.json`, calls a model for each phase, writes files under `./out`, verifies one check, retries once with the failure text, commits the phase in `./out/.git`, and writes `out/report.md`.

`phases.json` shape:

```json
{
  "phases": [
    { "name": "scaffold", "prompt": "Create files", "verify": { "type": "file_exists", "path": "out/index.html" } },
    { "name": "content", "prompt": "Add copy", "verify": { "type": "grep", "path": "out/index.html", "pattern": "Tiny TV" } }
  ]
}
```

Non-goals:

- No tools or MCP. Production tool wiring lives in `packages/harness/src/agent-sdk-tools.ts` and `packages/harness/src/strands-tools.ts`.
- No skills. Production knowledge injection lives in `packages/harness/src/phase-context.ts`.
- No resume. Production checkpoint handling lives in `packages/harness/src/checkpoint.ts`.
- No TUI. Production display lives in `packages/harness/src/tui.tsx`.
- No multi-provider model factory. Production provider selection lives in `packages/harness/src/model-factory.ts`.
- No full pipeline engine. Production retries, skips, dependencies, and abort behavior live in `packages/harness/src/pipeline-engine.ts`.

Use this package to explain the core loop, then use `packages/harness` to show what changes when the same idea has to survive real app generation.
