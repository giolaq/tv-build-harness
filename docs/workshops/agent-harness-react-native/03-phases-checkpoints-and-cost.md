# 3. Phases, Checkpoints, and Cost

## Goal

Split a larger task into phases and see how the harness resumes without repeating finished work.

## Do this

1. Run the phased example:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --stop-after content
```

2. Confirm the command says `Paused after content`.
3. Open the generated checkpoint. Find the completed phase, next phase, summaries, and cost.
4. Resume from the checkpoint:

```sh
npx tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json \
  --resume
```

5. Open the generated Git log and find one commit for each successful phase. Confirm the first two commits were not repeated.

## Why this matters

Phases limit the size of each change. Checkpoints save run progress. Commits preserve verified code states. Cost remains visible across the run.

## You are done when

The first command stops after `content`; the second starts at `focus`; completed phases are not repeated.

## If blocked

Read `docs/workshops/agent-harness-react-native/fixtures/resume/README.md` and continue with the instructor checkpoint.
