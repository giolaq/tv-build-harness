# Before You Arrive

## Required

- Node.js 18 or newer, Yarn 1.22, and Git.
- A clean, working React Native app or `apps/workshop-pocket-cinema`.
- Permission to share the selected source with your model provider.
- No production secrets, private customer data, or protected media.
- One execution path: local Claude Code, remote Strands credentials, or the committed replay fixtures.

Run:

```sh
cd packages/mini-harness && yarn install --frozen-lockfile
cd ../workshop-harness && yarn install --frozen-lockfile
npx tsx src/index.ts doctor --json
```

Check the path you intend to use:

```sh
# Local Claude Code
npx tsx src/index.ts doctor --executor claude-cli --json

# Remote Bedrock model through Strands
npx tsx src/index.ts doctor --executor strands --provider bedrock --json
```

## Vega live path

Install Vega SDK 0.22 and prepare a Vega Virtual Device. In a system terminal, initialize the pinned ADBT version listed by the instructor:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> check-status --agent claude-code-cli
```

If any live check fails, you can complete the workshop with committed recordings and checkpoints.
