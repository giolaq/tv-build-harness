# 9. Optional: Bee Context

## Goal

Select useful facts from a conversation without putting a full private transcript into the prompt or repository.

Skip this lesson if Bee is not configured or participants have not consented to retrieval.

## Do this

1. Search for relevant conversations:

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts context bee search \
  "Pocket Cinema product decisions" --json
```

2. Choose one result and create a local snapshot:

```sh
npx tsx src/index.ts context bee snapshot <conversationId> \
  --out candidate-context.json --json
```

3. Read the snapshot. Check its source ids, dates, query, summary, and hash.
4. Use the proposal and approval steps from lesson 5.
5. Disconnect Bee and confirm the approved snapshot still works.
6. Delete the local candidate if it contains private material. Never commit raw transcripts.

## Why this matters

External context should be selected, reviewable, and reproducible. A saved snapshot is easier to audit than a hidden live lookup.

## You are done when

You can show where every approved fact came from and repeat the run without Bee.

## If blocked

Use `fixtures/bee-context/snapshot.json`. It is synthetic and contains no private conversation.
