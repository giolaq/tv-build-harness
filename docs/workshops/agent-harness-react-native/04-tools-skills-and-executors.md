# 4. Tools, Skills, and Executors

## Goal

Separate domain instructions, system capabilities, and model access.

## Do this

1. Run Step 4 with replay:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --replay steps/04-skills/fixtures/demo-recording.json
```

2. Open these files:

- `skills.ts`: loads reusable instructions for a phase.
- `phase-context.ts`: builds the prompt for that phase.
- `executor.ts`: calls replay, Claude Code, or Strands.
- `recorder.ts`: records model requests and responses.

3. Find where a skill enters the phase prompt.
4. Compare the teaching modules with the production modules in `packages/mini-harness/ISOMORPHISM.md`.

Optional live run with Claude Code:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

Optional live run with Strands and Bedrock:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2
```

## Why this matters

A skill explains what matters. A tool performs a narrow action. An executor hides provider-specific model access. Keeping them separate makes the pipeline easier to test and change.

The full workshop port applies the same rule with Strands Agents SDK:

- `packages/workshop-harness/src/port-tools.ts` defines three Zod-typed tools: list, read, and search.
- The tools are scoped to the guarded app. They reject `.env`, `.git`, `node_modules`, absolute paths, and paths outside the app.
- `packages/workshop-harness/src/port-contract.ts` defines the patch schema. Strands validates the model output before the harness sees it.
- `packages/workshop-harness/src/port-executor.ts` limits each phase to eight turns, 40,000 total tokens, and ten minutes.
- The agent has no write or shell tool. `port-pipeline.ts` validates paths, writes files, runs checks, retries once, and commits passing work.

This is the main tool-design rule: give an agent the smallest capability needed for its current concern. Keep irreversible actions in deterministic harness code.

## You are done when

You can show where to change domain knowledge without changing the pipeline, and where to change model providers without changing verification.

## If blocked

Use replay. The architecture is visible without a live model.
