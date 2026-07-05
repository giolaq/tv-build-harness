# Run And Test Checklist

Use these commands when you want to validate the repo before a push, release, or workshop.

## Fresh Setup

There is no root workspace. Install dependencies per package:

```sh
cd packages/harness && yarn install --frozen-lockfile
cd ../verification && yarn install --frozen-lockfile
cd ../mini-harness && yarn install --frozen-lockfile
cd ../web-ui && yarn install --frozen-lockfile
```

## Required Checks Before Pushing

Run these from the repo root unless a command starts with `cd`:

```sh
cd packages/harness
yarn typecheck
yarn test

cd ../verification
yarn test
yarn build
```

Then return to the repo root and run the repository guards:

```sh
cd ../..
packages/harness/node_modules/.bin/tsx scripts/check-course-paths.ts
packages/harness/node_modules/.bin/tsx scripts/gen-input-docs.ts --check
packages/harness/node_modules/.bin/tsx scripts/scrub.ts --check docs examples
```

## Optional Package Checks

```sh
cd packages/mini-harness
yarn typecheck
yarn dev --phases fixtures/phases.json --replay fixtures/demo-recording.json
yarn dev --phases fixtures/phases.json --replay fixtures/retry-recording.json

cd ../web-ui
yarn build
```

## Key-Free Harness Smoke

```sh
cd packages/harness
npx tsx src/index.ts --help
npx tsx src/index.ts schema content --json
npx tsx src/index.ts init /tmp/tv-build-input --force
npx tsx src/index.ts validate /tmp/tv-build-input --json
npx tsx src/index.ts claude-run /tmp/tv-build-input --plan --json
```

Replay full-harness fixtures once they exist:

```sh
cd packages/harness
npx tsx src/index.ts replay cooking-shows --json --speed 10
```

## Live Checks With A Model Key

Use these only when `ANTHROPIC_API_KEY` and the Claude CLI are configured:

```sh
cd packages/harness
npx tsx src/index.ts doctor
npx tsx src/index.ts claude-run --example cooking-shows --generate-only --no-tui --seed workshop-fixed-seed --max-cost 10
npx tsx src/index.ts refine <runId> --phase branding "warmer palette, larger hero cards" --plan --json
npx tsx src/index.ts refine <runId> --phase branding "warmer palette, larger hero cards" --yes --json --max-cost 3
```

## Verification Batch Rules

Do not run or publish pass-rate numbers until:

- `packages/verification` passes `yarn test` and `yarn build`.
- `verify.config.json` states `seedPolicy`, `fixedSeed`, `maxBatchCostUsd`, and `perRunMaxCostUsd`.
- The batch size is chosen before the run.
- The report states the seed regime and pinned environment.

See `docs/pass-rates.md` for the publication rules.

## Release Smoke

```sh
cd packages/harness
yarn build
npm pack --pack-destination /tmp/tv-build-pack
mkdir -p /tmp/tv-build-install
cd /tmp/tv-build-install
npm install /tmp/tv-build-pack/tv-build-core-*.tgz
npx tv-build schema content --json
npx tv-build init input
npx tv-build validate input --json
```

Tag only after the release smoke passes and the changelog version matches `packages/harness/package.json`.
