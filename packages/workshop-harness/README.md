# Workshop Harness

This teaching package grows the four-stage mini-harness into the code used during **Past the Vibes**. It owns source discovery, guarded copies, portability audits, project memory, optional Bee context, and the handoff to the production `tv-build` CLI.

It does not import or modify `packages/harness`.

```sh
yarn install --frozen-lockfile
yarn typecheck
yarn test

npx tsx src/index.ts doctor --json
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --json
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 10 --json
```

`run` copies the source under `out/<runId>/app`; it never edits the original. It executes three verified, committed port phases and rolls a failed phase back before retry. Without `--replay`, the Claude CLI reads prompts through stdin and may use configured ADBT documentation tools. `vega-run` operates on that guarded app through the workshop Vega adapter; it never asks production `tv-build` to regenerate a different app from inputs.
