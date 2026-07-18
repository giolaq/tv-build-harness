# Tools, Skills, and Executors

## The failure

One prompt accumulates every command and domain rule, making capability broad and context noisy.

## The mechanism

Step 4 separates phase-context assembly, skills, executor, recorder, and replay. A phase receives only relevant knowledge and tools.

## Build it

```sh
cd packages/mini-harness
npx tsx steps/04-skills/index.ts run fixtures/phases.json --replay fixtures/demo-recording.json
```

Compare `packages/mini-harness/ISOMORPHISM.md` with the production architecture.

## Inspect the evidence

Find where the skill body enters the prompt and where the recorder taps the executor boundary.

## Checkpoint

The remaining workshop uses `packages/workshop-harness`, which extends these concepts without changing production `tv-build`.

## Fallback

All Step 4 concepts can be inspected without a model or device.

## Check yourself

<details><summary>Why put model access behind an executor?</summary>The pipeline can retain its state and checks while provider details change.</details>
