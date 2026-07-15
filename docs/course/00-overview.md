# Course Overview

## The problem

Teams want AI agents to build software, but a raw prompt is not a development system. You need a harness: inputs, phases, injected domain knowledge, verification, logs, replay, and repeatable demos.

Cost: free (reading).

Supported workshop hosts: macOS and Linux. On Windows, use WSL2. Native Windows is not supported.

## How this repo solves it

Start with the staged mini harness in `packages/mini-harness/steps/04-skills/pipeline-engine.ts:10`. It loads phases, runs each phase, verifies output, retries once, commits progress, and writes a report.

Then compare the production engine in `packages/harness/src/pipeline-engine.ts:33`. It keeps phase ordering, dependencies, retries, aborts, filtering, and resume deterministic.

The full CLI enters through `packages/harness/src/index.ts:72`, loads inputs in `packages/harness/src/index.ts:169`, and dispatches to executors under `packages/harness/src/executors/`.

The teaching default is the web target. Native Android TV, Apple TV, Fire TV, and Vega OS paths are optional victory laps after the web exercise works; budget 45-90 minutes for emulator, simulator, SDK, or device setup. The Android victory lap uses the official Android CLI through the workflow in `docs/android-cli-workflow.md`.

The important mental model:

1. Inputs define the desired product.
2. Phases decompose the work.
3. Skills inject domain knowledge only when relevant.
4. Verification turns model output into pass/fail feedback.
5. Observability makes the run teachable and debuggable.

Lessons:

1. `docs/course/01-why-a-harness.md`
2. `docs/course/02-strong-priors.md`
3. `docs/course/03-decomposition.md`
4. `docs/course/04-knowledge-injection.md`
5. `docs/course/05-verification.md`
6. `docs/course/06-observability.md`
7. `docs/course/07-your-harness-as-a-tool.md`

## Exercise

Open these three files:

`packages/mini-harness/steps/04-skills/pipeline-engine.ts:10`

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
