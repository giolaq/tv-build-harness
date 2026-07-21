# 2. Verification and Retry

## Goal

See a check fail, then see the harness send the exact failure into one retry.

## Do this

1. Run the recorded failure and repair:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --replay steps/02-verify-loop/fixtures/retry-recording.json
```

2. Find this failed check in the output:

```text
Pattern "Kitchen Stories" not found in out/src/catalog.ts
```

3. Open `steps/02-verify-loop/verify.ts` and find the `file_exists` and `grep` checks.
4. Open `out/src/catalog.ts` and confirm the retry added the missing title.
5. Find the same failure text in the retry request.

## Why this matters

The model does not grade its own work. The harness runs an independent check and gives the model useful failure evidence.

## You are done when

You can trace one requirement from check, to failure, to retry, to passing result.

## If blocked

Use `steps/02-verify-loop/fixtures/retry-recording.json`. Do not switch to a live model for this exercise.
