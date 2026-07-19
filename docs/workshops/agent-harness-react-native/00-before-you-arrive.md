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
cd packages/mini-harness
yarn install --frozen-lockfile
cd ../workshop-harness
yarn install --frozen-lockfile
```

## 3. Run the setup check

```sh
npx tsx src/index.ts doctor --json
```

You are ready when the output reports success. If model or device checks fail, choose replay and continue.

## 4. Choose one execution path

Replay needs no credentials:

```sh
cd ../mini-harness
npx tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

For local Claude Code:

```sh
cd ../workshop-harness
npx tsx src/index.ts doctor --executor claude-cli --json
```

For Strands with Bedrock:

```sh
cd ../workshop-harness
npx tsx src/index.ts doctor --executor strands --provider bedrock --json
```

## 5. Optional Vega setup

Install Vega SDK 0.22 and create a Vega Virtual Device. In a system terminal, use the ADBT version supplied by the instructor:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> check-status --agent claude-code-cli
```

You are ready for the live Vega exercise when the status check passes and the virtual device starts. Otherwise use the committed Vega checkpoint.

## Setup complete

Before the workshop, you should have:

- installed both packages;
- completed one replay run;
- chosen replay, Claude Code, or Strands;
- decided whether you will use Pocket Cinema or your own app.
