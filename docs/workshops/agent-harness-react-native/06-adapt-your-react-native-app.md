# Adapt Your React Native App

## The failure

An agent asked to "port my app" edits before understanding architecture, dependencies, scope, or risk.

## The mechanism

The workshop performs read-only discovery, creates a portability report, and copies source into a guarded run workspace.

## Build it

Choose your app or Pocket Cinema:

```sh
cd packages/workshop-harness
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --json
```

Show the source, target, findings, phases, seed, and cost cap before continuing:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --yes --seed workshop-v1 --max-cost 10 --json
```

For the key-free exercise, run the complete command with the canonical port recording:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

## Inspect the evidence

Confirm the source Git status is unchanged. Open the run's `portability-report.json`, `port-result.json`, generated app copy, report, and phase commits. The port phases document the TV product, add the Vega boundary, and adapt the remote flow before the production build handoff.

## Checkpoint

Use `checkpoints/audit-complete/` if your own app is unsuitable or takes longer than ten minutes to inspect.

## Fallback

Pocket Cinema is the supported path for every attendee.

## Check yourself

<details><summary>Why adapt one vertical slice?</summary>It bounds cost and verification while still crossing UI, navigation, platform, and behavior.</details>
