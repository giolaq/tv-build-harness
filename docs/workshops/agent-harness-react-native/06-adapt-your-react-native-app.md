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
3. Run the key-free port:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

4. Copy the `runId` from the output. You will use it in the Vega lesson.
5. Open `out/<runId>/portability-report.json` and `port-result.json`.
6. Inspect `out/<runId>/app` and its Git log.
7. Check that `apps/workshop-pocket-cinema` is still clean and unchanged.

## Why this matters

The harness reads first, states what can move, and edits a copy. One small flow keeps cost and verification manageable.

## You are done when

You have the `runId`, all five pre-Vega stages are complete, the three edit phases have verified commits, `tv-focus-result.json` passes, and the source app is unchanged. The sixth planned stage is the Vega lifecycle in lesson 8.

## If blocked

Use Pocket Cinema and `checkpoints/audit-complete/`. Do not spend more than 10 minutes adapting a different app during the workshop.
