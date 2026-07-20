# Workshop Harness

This package is used in the **Past the Vibes** workshop. It inspects a React Native app, copies it into a safe run directory, applies three small TV changes, verifies each change, and hands the result to Vega tools.

It never edits the source app. Generated work goes to `out/<runId>/app`. Run the commands below from any directory inside the repository.

## How Strands is used

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is the in-process agent runtime for `--executor strands`. This package pins TypeScript SDK `1.10.0`. It supplies model providers, the agent loop, Zod-typed tools, structured output, MCP, limits, cancellation, and metrics.

The port agent receives three tools from `src/port-tools.ts`: list project files, read one project file, and search project text. All three are read-only and limited to the guarded app. `src/port-contract.ts` defines the validated patch result. The agent is limited to eight turns, 40,000 total tokens, and ten minutes per phase.

The harness owns writes, checks, retries, Git commits, the cost cap, replay, and reports. The model never receives a shell or file-write tool.

## Install and test

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
yarn install --frozen-lockfile
yarn typecheck
yarn test
npx tsx src/index.ts doctor --replay --json
```

## Run the key-free workshop path

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --seed workshop-v1 --max-cost 3 --json
```

Read the plan. Then run the recorded port:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --yes --seed workshop-v1 --max-cost 3 --json
```

Copy the returned `runId`. Inspect:

- `out/<runId>/portability-report.json` for what can move to Vega;
- `out/<runId>/port-result.json` for phases, checks, retries, and cost;
- `out/<runId>/adbt-port-context.json` for the ADBT workflows injected into `vega_port`;
- `out/<runId>/app/NextSteps.md` for ADBT sources and unsupported mappings;
- `out/<runId>/app` for the generated app copy and phase commits.

## ADBT during the port

ADBT is runtime context for the harness, not only setup for the final device command. Before `vega_port`, a live run starts the pinned package as a stdio MCP server through Strands `McpClient`:

```text
connect -> discover tools
  -> list_documents(WORKFLOW, vega_os)
  -> read_document(port_tv_app_to_vega.md)
  -> read_document(port_tv_app_to_vega_fos_rn_app.md)
  -> inject context into vega_port
  -> save names, excerpts, and hashes
  -> disconnect
```

The provider requires those two tool names and always disconnects in `finally`. It does not run `init-context` or change Claude configuration.

The normal replay command automatically loads `fixtures/adbt-port-context.json`. To call ADBT for real while keeping the model response key-free, add `--adbt-live`:

```sh
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json
```

A fully live model run calls ADBT automatically. If ADBT cannot supply the workflows, the harness stops with exit `3`; it does not let the port continue from unsupported assumptions.

## Choose a model executor

Replay is the workshop default because it needs no account:

```sh
npx tsx src/index.ts run <app> --replay <recording.json> --yes --json
```

Use local Claude Code:

```sh
npx tsx src/index.ts run <app> \
  --executor claude-cli --model sonnet --yes --json
```

Use a remote model through Strands Agents SDK:

```sh
npx tsx src/index.ts run <app> \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2 --yes --json
```

Strands supports `bedrock`, `openai`, and `openrouter`. Configure the provider credentials before running `doctor`.

## Vega handoff

Use the run id from the port:

```sh
npx tsx src/index.ts vega-run <runId> --plan --json
# Read the plan before choosing replay or live execution.
```

The workshop pins ADBT `1.0.5` and Vega SDK `0.22.5875`. The live lifecycle checks the SDK and device, builds a `.vpkg`, installs it, launches it, captures logs, takes a screenshot, pulls the screenshot, and records the focus-check result.

Use the key-free lifecycle in the workshop:

```sh
npx tsx src/index.ts vega-run <runId> \
  --platform-replay ../../docs/workshops/agent-harness-react-native/fixtures/vega-lifecycle.json \
  --yes --json
```

The report marks this as replay evidence. It tests the harness contract, not a Vega device. For a live run, start VDA in a system terminal and keep it open:

```sh
vega virtual-device start --gui
```

In a second terminal, require `running: true` and a non-empty device list before continuing:

```sh
vega virtual-device status
vega exec vda devices -l
```

Then install the generated app's pinned dependencies and run the live lifecycle:

```sh
cd out/<runId>/app/apps/vega
npm install
cd ../../../..
npx tsx src/index.ts vega-run <runId> --yes --json
```

An empty VDA device list stops the lifecycle even if the command exits `0`. A live claim requires install, launch, device logs, a pulled screenshot, and `evidenceMode: "live"`.

See the [workshop guide](../../docs/workshops/agent-harness-react-native/README.md) for the full attendee flow.
