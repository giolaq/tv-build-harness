# Workshop Harness

This package is used in the **Past the Vibes** workshop. It inspects a React Native app, copies it into a safe run directory, applies three small TV changes, verifies each change, and hands the result to Vega tools.

It never edits the source app. Generated work goes to `out/<runId>/app`.

## Install and test

```sh
yarn install --frozen-lockfile
yarn typecheck
yarn test
npx tsx src/index.ts doctor --json
```

## Run the key-free workshop path

From `packages/workshop-harness`:

```sh
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the plan. Then run the recorded port:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Copy the returned `runId`. Inspect:

- `out/<runId>/portability-report.json` for what can move to Vega;
- `out/<runId>/port-result.json` for phases, checks, retries, and cost;
- `out/<runId>/app` for the generated app copy and phase commits.

## Choose a model executor

Replay is the workshop default because it needs no account:

```sh
npx tsx src/index.ts run <app> --replay <recording.json> --yes --json
```

Use local Claude Code:

```sh
npx tsx src/index.ts run <app> \
  --executor claude-cli --model sonnet --yes --json
```

Use a remote model through Strands:

```sh
npx tsx src/index.ts run <app> \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --yes --json
```

Strands supports `bedrock`, `openai`, and `openrouter`. Configure the provider credentials before running `doctor`.

## Vega handoff

Use the run id from the port:

```sh
npx tsx src/index.ts vega-run <runId> --plan --json
# Read and approve the plan.
npx tsx src/index.ts vega-run <runId> --yes --json
```

ADBT supplies Vega instructions and diagnostics. Kepler and VDA build and run the guarded app. The workshop harness records the evidence.

See the [workshop guide](../../docs/workshops/agent-harness-react-native/README.md) for the full attendee flow.
