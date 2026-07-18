# Vega Platform Adapter

## The failure

Platform shell commands spread through prompts, become hard to test, and blur knowledge tools with execution tools.

## The mechanism

ADBT supplies Vega knowledge and diagnostics. Kepler/VDA perform deterministic platform actions. The workshop package delegates the final run to production `tv-build` through its public JSON CLI.

## Build it

Verify ADBT in a system terminal using the instructor-pinned version. Then inspect `packages/workshop-harness/src/platform/vega.ts` and run:

```sh
cd packages/workshop-harness
npx tsx src/index.ts doctor --json
npx tsx src/index.ts vega-run <workshopRunId> --plan --json
# After showing the plan and cost:
npx tsx src/index.ts vega-run <workshopRunId> --yes --seed workshop-v1 --max-cost 10 --json
```

## Inspect the evidence

Collect SDK and ADBT versions, VDA image, build/launch status, logs, screenshots, D-pad checks, seed, and cost.

## Checkpoint

Use `checkpoints/complete/` if live platform execution cannot finish in 20 minutes.

## Fallback

The complete checkpoint and Vega report preserve the lesson without a device.

## Check yourself

<details><summary>What is ADBT responsible for?</summary>Vega-specific skills, documentation, and diagnostics. Kepler/VDA own platform execution; the harness owns the loop.</details>
