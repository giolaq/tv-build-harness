# 06. Observability

## The problem

If a run only succeeds or fails, you cannot teach it, debug it, or improve it. You need the prompt, responses, usage, report, and per-phase commits.

Cost: free (replay).

## How this repo solves it

Recorded turns use the shape in `packages/harness/src/recorder.ts:4`.

Replay is driven by `ReplayClient` in `packages/harness/src/recorder.ts:46` and surfaced by the CLI in `packages/harness/src/index.ts:570`.

Replay supports file paths and fixture names in `packages/harness/src/index.ts:616`, speed control in `packages/harness/src/index.ts:631`, and token/cost totals in `packages/harness/src/recorder.ts:94`.

Creative UI runs include controlled randomness through a creative seed. The seed is selected at run start, written into `spec.json`, `report.md`, checkpoints, and recordings, and reused by replay fixtures. Fix the seed when you regenerate fixtures or compare verification runs; leave it random when you want demo variety.

The mini harness adds the simplest observable Git trail: each successful phase commits in `packages/mini-harness/src/index.ts:136`.

The full harness uses the same per-phase commit idea to make targeted `refine` safe: a successful refine becomes a new app commit, while a failed refine restores a clean tree. See `docs/course/07-your-harness-as-a-tool.md`.

## Exercise

Run the retry fixture:

```sh
cd packages/mini-harness
yarn dev --phases fixtures/phases.json --replay fixtures/retry-recording.json
git -C out log --oneline
cat out/report.md
```

Cost: free (replay).

Find the retried `content` phase in `fixtures/retry-recording.json`. Read the first failed response, then inspect the second `content` request to see the failure text that was fed back into the retry prompt. Finally, match the successful phase to the `mini-harness: content` commit in `out/.git`.

## Check yourself

What does `ReplayClient` replay?

<details><summary>Answer</summary>

It replays `RecordedTurn[]` entries from a recording file.

</details>

Why does replay show token and cost totals?

<details><summary>Answer</summary>

The recording stores usage per turn, and `summarizeRecordedTurns()` aggregates it.

</details>

What does the Git log add that a transcript does not?

<details><summary>Answer</summary>

It shows exactly which file state was accepted after each phase.

</details>
