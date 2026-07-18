# Project Memory

## The failure

Checkpoints can resume execution but should not silently become permanent product truth.

## The mechanism

`packages/workshop-harness/src/project-memory.ts` stores approved decisions, constraints, conventions, open questions, and provenance. Bee or file context first becomes a proposal.

## Build it

```sh
cd packages/workshop-harness
npx tsx src/index.ts memory show ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --json
npx tsx src/index.ts memory propose ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json --json
npx tsx src/index.ts memory apply ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json --yes --json
```

## Inspect the evidence

Open `PROJECT_CONTEXT.md` and `project-context.json`. Verify that open questions are not product decisions and every entry cites a source.

## Checkpoint

Revert the fixture changes after inspection or use a copied input directory.

## Fallback

The committed Bee snapshot is synthetic and works without Bee.

## Check yourself

<details><summary>How is memory different from a checkpoint?</summary>Memory preserves approved product facts across runs; a checkpoint preserves execution progress inside a run.</details>
