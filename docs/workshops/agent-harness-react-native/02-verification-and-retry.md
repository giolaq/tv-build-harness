# Verification and Retry

## The failure

The first response can look plausible while omitting a required file or behavior.

## The mechanism

`packages/mini-harness/steps/02-verify-loop/verify.ts` runs `file_exists` and `grep` checks. Failed evidence is appended to one retry.

## Build it

```sh
cd packages/mini-harness
npx tsx steps/02-verify-loop/index.ts run steps/02-verify-loop/fixtures/phases.json --replay steps/02-verify-loop/fixtures/retry-recording.json
```

## Inspect the evidence

Find the first failed check and the same failure text in the retry request. The retry is bounded; it cannot quietly spend forever.

## Checkpoint

You now have the first closed loop: execute, verify, retry with evidence.

## Fallback

The committed retry recording is the canonical exercise.

## Check yourself

<details><summary>Why not ask the model whether its work is correct?</summary>The model's opinion is not independent evidence. Run a mechanical check.</details>
