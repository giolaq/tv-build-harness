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
  --yes --seed workshop-v1 --max-cost 10 --json
```

`run` copies the source under `out/<runId>/app`; it never edits the original. `vega-run` delegates final execution to the installed `tv-build` executable. Set `TV_BUILD_BIN` during source development.
