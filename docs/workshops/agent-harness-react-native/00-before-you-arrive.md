# Before You Arrive

Allow about 20 minutes. Stop troubleshooting after 10 minutes and use replay. Live setup must not block the workshop.

## What runs the agent

[Strands Agents SDK](https://github.com/strands-agents/harness-sdk) is the in-process TypeScript runtime for the workshop's remote model path. The production workshop harness pins `1.10.0`; the staged mini-harness and general TV Build harness currently pin `1.7.0`. We use it for:

- one bounded agent per phase;
- Bedrock, OpenAI, or OpenRouter model access;
- three Zod-typed, read-only project tools;
- schema-validated patch output;
- the native MCP connection to ADBT;
- token usage, turn limits, and cancellation.

The harness still owns the plan, approval, writes, checks, retry, Git commits, cost cap, and report. The model does not get a shell or a write tool.

Replay uses the same phase and evidence contracts without contacting a model or MCP server.

## 1. Check the basics

Install Node.js 20 or newer, Yarn 1.22, and Git. Clone the repository and open a terminal at its root.

If you bring your own React Native app, check that it:

- runs before the workshop;
- has a clean Git status;
- contains no production secrets, private data, or protected media;
- can be shared with your chosen model provider.

`apps/workshop-pocket-cinema` is the supported fallback.

## 2. Install the workshop packages

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
yarn install --frozen-lockfile
cd ../workshop-harness
yarn install --frozen-lockfile
```

## 3. Run the setup check

```sh
npx tsx src/index.ts doctor --replay --json
```

You are ready when the output reports success. If model or device checks fail, choose replay and continue.

To rehearse live ADBT context with the model and Vega device still replayed:

```sh
npx tsx src/index.ts doctor --replay --adbt-live --json
```

## 4. Choose one execution path

Replay needs no credentials:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

For local Claude Code:

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --executor claude-cli --json
```

For Strands with Bedrock:

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --executor strands --provider bedrock --json
```

## 5. Optional Vega setup

Install Vega SDK `0.22.5875` and create a Vega Virtual Device. The harness starts pinned ADBT `1.0.5` as an MCP server during a live `vega_port` phase. It discovers the MCP tools, calls `list_documents`, reads the two approved port workflows, and disconnects. You do not need to run `init-context` because the harness owns this connection. Replay uses a committed ADBT context snapshot.

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --replay --adbt-live --json
vega --version
vega virtual-device start --gui
```

Keep that terminal open. In a second system terminal, confirm that both checks show a running device:

```sh
vega virtual-device status
vega exec vda devices -l
```

You are ready for the live Vega exercise when the SDK prints `0.22.5875`, virtual-device status reports `running: true`, and `devices -l` lists an attached device. Otherwise choose replay. Do not spend workshop time repairing the device.

## Setup complete

Before the workshop, you should have:

- installed both packages;
- completed one replay run;
- chosen replay, Claude Code, or Strands;
- decided whether you will use Pocket Cinema or your own app.
