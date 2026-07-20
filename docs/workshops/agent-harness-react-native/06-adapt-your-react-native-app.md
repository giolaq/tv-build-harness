# 6. Adapt Your React Native App

## Goal

Inspect an app, review the plan, and change only a guarded copy.

Use Pocket Cinema unless your own app already runs and passes the setup checks.

## Do this

1. Create a read-only plan:

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

2. Before running, check the source path, target flow, portability findings, full phase sequence, seed, and cost cap.
3. Run the key-free port. The harness automatically loads the recorded ADBT context beside the model recording:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

4. Copy the `runId` from the output. You will use it in the Vega lesson.
5. Open `out/<runId>/adbt-port-context.json`. Find the two ADBT workflows and their hashes.
6. Open `out/<runId>/port-result.json`. Confirm `adbt.mode` is `replay` and the context belongs to `vega_port`.
7. Open `out/<runId>/app/NextSteps.md`. Find the ADBT sources and the section for unsupported mappings.
8. Inspect `out/<runId>/app` and its Git log.
9. Check that `apps/workshop-pocket-cinema` is still clean and unchanged.

## Optional: call ADBT MCP live without a model account

Check the native MCP connection, then run the same port with `--adbt-live`. The model output still comes from the recording, but the harness starts pinned ADBT `1.0.5` over stdio before `vega_port`:

```sh
npx tsx src/index.ts doctor --replay --adbt-live --json
```

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json
```

Open that run's `adbt-port-context.json`. Its `mode` is `live`. A fully live Claude Code or Strands run uses the same ADBT provider automatically.

Trace the MCP lifecycle in `src/context-providers/adbt.ts`:

1. Create Strands `McpClient` with a stdio transport.
2. Discover the server tools.
3. Require `list_documents` and `read_document` by name.
4. List Vega `WORKFLOW` documents before reading anything.
5. Read only the two approved port workflows.
6. Save names, excerpts, and hashes, then disconnect in `finally`.

ADBT is not handed to the model as an unrestricted tool box. The harness chooses the documents and injects their recorded context only into `vega_port`. This gives replay a stable input and keeps crash or performance tools out of a migration phase that does not need them.

## Why this matters

The harness reads first, asks ADBT MCP for current Vega migration workflows, injects only that platform context into `vega_port`, and edits a copy. The model executor can change without losing the platform guidance.

## You are done when

You have the `runId`, ADBT evidence names the two migration workflows, all five pre-Vega stages are complete, the three edit phases have verified commits, `tv-focus-result.json` passes, and the source app is unchanged. The sixth planned stage is the Vega lifecycle in lesson 8.

## If blocked

Use Pocket Cinema and `checkpoints/audit-complete/`. Do not spend more than 10 minutes adapting a different app during the workshop.
