# Bee Context Agent

## The failure

Useful product conversations remain outside the repository, while importing entire transcripts creates opaque, private, and noisy prompts.

## The mechanism

Bee is an optional context provider. Search, select, summarize, review, approve, and save a provenance-aware snapshot. The run remains reproducible with Bee disconnected.

## Build it

With Bee configured:

```sh
cd packages/workshop-harness
npx tsx src/index.ts context bee search "Pocket Cinema product decisions" --json
npx tsx src/index.ts context bee snapshot <conversationId> --out candidate-context.json --json
```

Review the candidate, then use the memory proposal/apply flow from lesson 05. Never commit raw private transcripts.

## Inspect the evidence

Check source ids, timestamps, query, summary hash, and the approved memory diff.

## Checkpoint

Use `fixtures/bee-context/snapshot.json` when Bee is unavailable or no participant consents to live retrieval.

## Fallback

The file provider is a first-class mode, not a degraded hidden path.

## Check yourself

<details><summary>Why save the approved snapshot?</summary>It makes later runs reviewable and reproducible without live Bee access.</details>
