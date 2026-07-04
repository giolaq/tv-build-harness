# 01. Why A Harness

## The problem

A one-shot prompt can produce impressive output, but it is hard to resume, test, audit, or teach. Software development needs a loop, not a single completion.

Cost: free (reading).

## How this repo solves it

The mini harness shows the irreducible loop in `packages/mini-harness/src/index.ts:34`: load phases, run a phase, verify it, commit it, and write a report.

The production harness keeps that shape but adds durable state in `packages/harness/src/run-context.ts:19`, pipeline policy in `packages/harness/src/pipeline-engine.ts:33`, and CLI modes in `packages/harness/src/index.ts:72`.

The harness is useful because each phase has a boundary. A failed `branding` phase can be retried with the actual verification error instead of asking the model to guess what went wrong.

The important tradeoff: the harness is more code than a prompt, but it makes the workflow inspectable.

## Exercise

Run the mini harness replay:

```sh
cd packages/mini-harness
yarn dev --phases fixtures/phases.json --replay fixtures/demo-recording.json
git -C out log --oneline
cat out/report.md
```

Cost: free (replay).

Identify the three phase commits in the generated `out/.git` history.

## Check yourself

What artifact makes each mini-harness phase auditable?

<details><summary>Answer</summary>

The Git commit created by `commitPhase()` in `packages/mini-harness/src/index.ts:136`.

</details>

Where does the production harness keep deterministic retry policy?

<details><summary>Answer</summary>

`packages/harness/src/pipeline-engine.ts:90`

</details>

Why not put all logic inside the model prompt?

<details><summary>Answer</summary>

Control flow, retries, verification, and reporting are easier to test and trust as code.

</details>
