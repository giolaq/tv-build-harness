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

The live port stops with exit `3` before `vega_port`; it does not continue without platform context. Run the pinned `check-status` command once. The harness uses ADBT's direct `exec` interface and does not require `init-context`. Run initialization only if you also want the model to call ADBT tools directly; it edits `CLAUDE.md` and your Claude configuration.

If ADBT still fails, remove `--adbt-live` and use the recorded context beside `port-recording.json`. Inspect `adbt-port-context.json` in the run output to confirm the fallback was used.

## Vega CLI build or VDA fails

Check each boundary separately:

```sh
vega --version
vega virtual-device status
vega exec vda devices -l
```

The expected SDK is `0.22.5875`. Start VDA with `vega virtual-device start --gui` in a system terminal and keep that terminal open. An empty device list is a failure even when the command exits `0`.

If the device is attached but the build fails, use `checkpoints/vega-buildable/app`, run `npm ci` in `app/apps/vega`, and run `npm run build:debug`. Do not run `npm audit fix --force`; the SDK template uses pinned React Native 0.72-era dependencies.

Write down whether the failure came from SDK setup, device attachment, build, or app behavior. Try one repair, then use `checkpoints/complete/`.

## Bee is unavailable

Use `fixtures/bee-context/snapshot.json`. Bee is optional.

## A detached run appears stuck

Run `status <runId> --json`, then `logs <runId>`. Do not edit files under `out/`.
