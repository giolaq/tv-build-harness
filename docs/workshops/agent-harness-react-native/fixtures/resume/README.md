# Resume Fixture

Use the Step 3 recording in `packages/mini-harness/steps/03-phases/fixtures/`. Run it with `--stop-after content`, then open `out/checkpoint.json`. Confirm `nextPhase` is `2`, which maps to `polish` in `phases.json`. Run the command again with `--resume`. You are done when only `polish` runs and the earlier commits are not repeated.
