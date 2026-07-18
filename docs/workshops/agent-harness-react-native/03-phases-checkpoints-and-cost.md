# Phases, Checkpoints, and Cost

## The failure

A long task fails late, repeats expensive work, and hides which concern caused the regression.

## The mechanism

Step 3 adds `pipeline-engine.ts`, `checkpoint.ts`, `run-context.ts`, phase commits, and accumulated cost.

## Build it

```sh
cd packages/mini-harness
npx tsx steps/03-phases/index.ts run fixtures/phases.json --replay fixtures/demo-recording.json
npx tsx steps/03-phases/index.ts run fixtures/phases.json --replay fixtures/demo-recording.json --resume
```

Use the instructor's Step 3 recording when the fixture is marked rehearsal-deferred.

## Inspect the evidence

Open the checkpoint and identify the next phase, summaries, and cost. Kill and resume the instructor demo.

## Checkpoint

Copy the instructor checkpoint if your run did not reach the next module.

## Fallback

Read the committed resume transcript in `fixtures/resume/README.md`.

## Check yourself

<details><summary>What belongs in a checkpoint?</summary>Execution state needed to resume, not permanent product decisions.</details>
