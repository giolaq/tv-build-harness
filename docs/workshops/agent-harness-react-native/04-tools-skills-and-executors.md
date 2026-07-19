# 4. Tools, Skills, and Executors

## Goal

Separate domain instructions, system capabilities, and model access.

## Do this

1. Run Step 4 with replay:

```sh
cd packages/mini-harness
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

## You are done when

You can show where to change domain knowledge without changing the pipeline, and where to change model providers without changing verification.

## If blocked

Use replay. The architecture is visible without a live model.
