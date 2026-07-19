# Troubleshooting

Spend no more than 10 minutes on a live dependency. Try the listed repair once, then use replay or a checkpoint and continue.

## Setup or typecheck fails

Run `yarn install --frozen-lockfile` inside the package used by the lesson. Run the command again. If it still fails, use replay.

## The app is not found

Check that the app directory contains `package.json` and runs before the workshop. Otherwise use `apps/workshop-pocket-cinema`.

## A model call fails

Save the error and logs. Do not keep retrying. Use the lesson recording.

## The cost cap is reached

Stop. Do not raise the cap without the participant's approval. Continue from the checkpoint.

## ADBT is unavailable

Run the pinned `check-status` command once in a system terminal. If it still fails, use the committed Vega checkpoint.

## Kepler build or VDA fails

Write down whether the failure came from setup or the app. Try one repair, then use `checkpoints/complete/`.

## Bee is unavailable

Use `fixtures/bee-context/snapshot.json`. Bee is optional.

## A detached run appears stuck

Run `status <runId> --json`, then `logs <runId>`. Do not edit files under `out/`.
