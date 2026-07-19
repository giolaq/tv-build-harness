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

`run` copies the source under `out/<runId>/app`; it never edits the original. It executes three verified, committed port phases and rolls a failed phase back before retry. `vega-run` operates on that guarded app through the workshop Vega adapter; it never asks production `tv-build` to regenerate a different app from inputs.

## Model execution

The pipeline depends on the `PortExecutor` interface, not on one model SDK. Pick one path:

```sh
# Local Claude Code; prompts travel over stdin. This is the default.
npx tsx src/index.ts run <app> --executor claude-cli --model sonnet --yes --json

# Remote model through the Strands Agents SDK.
npx tsx src/index.ts run <app> --executor strands \
  --provider bedrock --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --yes --json

# Key-free workshop path.
npx tsx src/index.ts run <app> --replay <recording.json> --yes --json
```

The remote workshop providers are `bedrock`, `openai`, and `openrouter`. Configure `AWS_PROFILE`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`. The package never imports the Anthropic SDK. To use Claude, choose local Claude Code or select a Claude model through Bedrock/OpenRouter via Strands. Local Claude Code can use configured ADBT documentation tools.
