# From Prompt to Loop

## The failure

A model can produce convincing code without bounded scope, evidence, cost control, or a way to resume.

## The mechanism

Read `packages/mini-harness/steps/01-single-agent/index.ts`. It makes the smallest useful boundary visible: prompt, model call, response, and written files.

## Build it

Run Step 1 against its recording:

```sh
cd packages/mini-harness
npx tsx steps/01-single-agent/index.ts run steps/01-single-agent/fixtures/phases.json --replay steps/01-single-agent/fixtures/demo-recording.json
```

## Inspect the evidence

List what the model could claim without proving. Record a baseline duration and cost from the replay.

## Checkpoint

Keep your Step 1 output. Step 2 will deliberately reject part of it.

## Fallback

Replay is free and requires no key.

## Check yourself

<details><summary>What makes this an agent call rather than a harness?</summary>It lacks mechanical verification, bounded retry, phases, checkpoint state, and evidence.</details>
