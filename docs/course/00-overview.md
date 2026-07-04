# Course Overview

## The problem

Teams want AI agents to build software, but a raw prompt is not a development system. You need a harness: inputs, phases, injected domain knowledge, verification, logs, replay, and repeatable demos.

Cost: free (reading).

## How this repo solves it

Start with the smallest loop in `packages/mini-harness/src/index.ts:34`. It loads phases, runs each phase, verifies output, retries once, commits progress, and writes a report.

Then compare the production engine in `packages/harness/src/pipeline-engine.ts:33`. It keeps phase ordering, dependencies, retries, aborts, filtering, and resume deterministic.

The full CLI enters through `packages/harness/src/index.ts:72`, loads inputs in `packages/harness/src/index.ts:169`, and dispatches to executors under `packages/harness/src/executors/`.

The important mental model:

1. Inputs define the desired product.
2. Phases decompose the work.
3. Skills inject domain knowledge only when relevant.
4. Verification turns model output into pass/fail feedback.
5. Observability makes the run teachable and debuggable.

## Exercise

Open these three files:

`packages/mini-harness/src/index.ts:34`

`packages/harness/src/pipeline-engine.ts:33`

`packages/harness/src/harness-config.ts:156`

Write one sentence for each: what responsibility does this file own?

## Check yourself

What is the production harness engine file?

<details><summary>Answer</summary>

`packages/harness/src/pipeline-engine.ts`

</details>

What file defines the default TV phase list?

<details><summary>Answer</summary>

`packages/harness/src/harness-config.ts`

</details>

Why does the mini harness exist?

<details><summary>Answer</summary>

It isolates the core loop so you can teach the idea without tools, skills, TUI, multi-provider routing, or TV-specific details.

</details>
