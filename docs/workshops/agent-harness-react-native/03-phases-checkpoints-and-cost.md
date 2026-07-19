# 3. Phases, Checkpoints, and Cost

## Goal

Split a larger task into phases and see how the harness resumes without repeating finished work.

## Do this

1. Run the phased example:

```sh
cd packages/mini-harness
npx tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json
```

2. Open the generated checkpoint. Find the completed phase, next phase, summaries, and cost.
3. Run the same command with `--resume`:

```sh
npx tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --resume
```

4. Open the generated Git log and find one commit for each successful phase.

## Why this matters

Phases limit the size of each change. Checkpoints save run progress. Commits preserve verified code states. Cost remains visible across the run.

## You are done when

You can explain which work resumes from a checkpoint and which product facts belong in source control instead.

## If blocked

Read `docs/workshops/agent-harness-react-native/fixtures/resume/README.md` and continue with the instructor checkpoint.
