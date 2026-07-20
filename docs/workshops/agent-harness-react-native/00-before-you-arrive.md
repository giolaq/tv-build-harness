# Before You Arrive

Allow about 20 minutes. Stop troubleshooting after 10 minutes and use replay. Live setup must not block the workshop.

## 1. Check the basics

Install Node.js 18 or newer, Yarn 1.22, and Git. Clone the repository and open a terminal at its root.

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

Install Vega SDK `0.22.5875` and create a Vega Virtual Device. The harness calls ADBT at runtime during a live `vega_port` phase. Replay uses a committed ADBT context snapshot instead. ADBT's `init-context` command is needed only when you also want the model to call ADBT tools directly; it updates the repository's `CLAUDE.md` and your Claude configuration, so review those changes after running it.

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 check-status --agent claude-code-cli
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
