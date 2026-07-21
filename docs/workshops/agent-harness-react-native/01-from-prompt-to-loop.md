# 1. From Prompt to Loop

## Goal

Run the smallest possible agent program against a React Native app, then identify what its output does not prove.

## Do this

1. Run Step 1 with the committed recording:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

2. Open `steps/01-single-agent/index.ts`.
3. Find where it builds the prompt, gets a response, and writes files.
4. Open `out/src/App.tsx` and `out/src/components/ShowCard.tsx`.
5. Write down three things the model could claim without proving. Examples: TypeScript compiles, catalog content is present, or remote focus works.

## Why this matters

The toy target is already React Native. Later lessons add verification, skills, Strands, ADBT, and platform work around the same kind of app. The concerns become more platform-specific, while the core loop remains phase, skill, executor, check.

A model response can look good and still be wrong. A harness adds checks, limits, and evidence around the model call.

## You are done when

You can point to the model boundary and name at least three missing checks.

## If blocked

Use the replay command above. It is free and needs no model account.
