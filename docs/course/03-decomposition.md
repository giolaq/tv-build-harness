# 03. Decomposition

## The problem

Large agent tasks fail because too many concerns are active at once: planning, cloning, theming, data, navigation, platform builds, QA, and performance.

Cost: free (reading).

## How this repo solves it

The pipeline decomposes generation into explicit phases in `packages/harness/src/harness-config.ts:156`.

`runPipeline()` in `packages/harness/src/pipeline-engine.ts:33` owns the loop. It skips completed phases at `packages/harness/src/pipeline-engine.ts:40`, blocks failed dependencies at `packages/harness/src/pipeline-engine.ts:54`, and aborts load-bearing failures at `packages/harness/src/pipeline-engine.ts:73`.

Retry behavior is isolated in `packages/harness/src/pipeline-engine.ts:90`. Internal-loop phases such as visual QA or Vega QA can manage their own iteration.

Filtering is also deterministic. `selectActivePhases()` in `packages/harness/src/pipeline-engine.ts:125` removes build phases for `--generate-only` and platform-gated phases when the platform is not targeted.

## Exercise

Open `packages/harness/src/harness-config.ts:220`.

Trace the Vega path from `vega_setup_check` through `vega_hot_functions`. Write down why each phase depends on the previous phase.

Cost: free (reading).

## Check yourself

Which function decides whether a phase is active for a run?

<details><summary>Answer</summary>

`selectActivePhases()` in `packages/harness/src/pipeline-engine.ts:125`.

</details>

Why does `plan` use `abortOnFailure`?

<details><summary>Answer</summary>

Downstream phases need a valid `AppSpec`; continuing after plan failure creates meaningless work.

</details>

What makes the engine testable without a model?

<details><summary>Answer</summary>

The executor is injected into `runPipeline()`, so tests can use a fake executor.

</details>
