# 5. Project Memory

## Goal

Review proposed project facts before saving them for later runs.

## Do this

1. Make a disposable copy of the input fixture:

```sh
rm -rf /tmp/pocket-cinema-inputs
cp -R docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \
  /tmp/pocket-cinema-inputs
cd packages/workshop-harness
```

2. Show the current project memory:

```sh
npx tsx src/index.ts memory show /tmp/pocket-cinema-inputs --json
```

3. Build a proposal from the synthetic context snapshot:

```sh
npx tsx src/index.ts memory propose /tmp/pocket-cinema-inputs \
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \
  --json
```

4. Read the proposal. Check the source and keep open questions separate from decisions.
5. Apply it only after review:

```sh
npx tsx src/index.ts memory apply /tmp/pocket-cinema-inputs \
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \
  --yes --json
```

6. Open `/tmp/pocket-cinema-inputs/PROJECT_CONTEXT.md` and `project-context.json`.

## Why this matters

A checkpoint records where a run stopped. Project memory records approved facts that should survive across runs. They are not the same thing.

## You are done when

Every saved entry has a source, and no open question has been stored as a decision.

## If blocked

Use the committed synthetic snapshot. Bee is not required.
