# 1. From Prompt to Loop

## Goal

Run the smallest possible agent program, then identify what its output does not prove.

## Do this

1. Run Step 1 with the committed recording:

```sh
cd packages/mini-harness
npx tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

2. Open `steps/01-single-agent/index.ts`.
3. Find where it builds the prompt, gets a response, and writes files.
4. Write down three things the model could claim without proving. Examples: a file compiles, text is present, or navigation works.

## Why this matters

A model response can look good and still be wrong. A harness adds checks, limits, and evidence around the model call.

## You are done when

You can point to the model boundary and name at least three missing checks.

## If blocked

Use the replay command above. It is free and needs no model account.
