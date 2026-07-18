# Troubleshooting

## Workshop package does not typecheck

Run `yarn install --frozen-lockfile` inside `packages/workshop-harness`. If setup remains red after ten minutes, use the committed replay/checkpoint and continue.

## My app is not discovered

Confirm the selected directory contains `package.json`. Remove secrets and ensure the app already works locally. Otherwise switch to `apps/workshop-pocket-cinema`.

## Model or budget failure

Do not raise the cap automatically. Read the failed check and report, then use the checkpoint for the next module.

## ADBT is unavailable

Run `check-status` in a system terminal. If repair fails once, use the pinned ADBT evidence fixture. Do not reinstall repeatedly during the workshop.

## Kepler build or VDA fails

Record the environment error separately from product verification. Time-box repair to ten minutes, then use `checkpoints/complete/` for evidence inspection.

## Bee is unavailable

Use `fixtures/bee-context/snapshot.json`. Bee is optional and the approved snapshot is the reproducible contract.

## A detached run appears stuck

Read `status <runId> --json`, then `logs <runId>`. Do not edit generated status or output files.
