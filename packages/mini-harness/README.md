# Mini Harness

This package builds the same small website four times. Each step adds one part of a coding harness. Run all commands from `packages/mini-harness`.

## Install

```sh
yarn install --frozen-lockfile
```

## Step 1: one model call

The program sends a prompt and writes files. It does not check the result.

```sh
npx tsx steps/01-single-agent/index.ts run \
  steps/01-single-agent/fixtures/phases.json \
  --replay steps/01-single-agent/fixtures/demo-recording.json
```

Done when `out/` contains the generated site and you can name three claims that still need checks.

## Step 2: check and retry

This step adds `file_exists` and `grep` checks. One recorded response fails, and the exact failure is sent into one retry.

```sh
npx tsx steps/02-verify-loop/index.ts run \
  steps/02-verify-loop/fixtures/phases.json \
  --replay steps/02-verify-loop/fixtures/retry-recording.json
```

Done when you see `Pattern "Kitchen Stories" not found` followed by a successful repair.

## Step 3: phases and resume

This step adds phase config, checkpoints, cost tracking, reports, and one Git commit per passing phase.

```sh
npx tsx steps/03-phases/index.ts run \
  steps/03-phases/fixtures/phases.json \
  --replay steps/03-phases/fixtures/demo-recording.json
```

Run it again with `--resume` to inspect the resume path.

## Step 4: skills and executors

This step adds skills, prompt assembly, a model interface, and recording/replay.

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --replay steps/04-skills/fixtures/demo-recording.json
```

Done when you can trace a skill into the prompt and show where replay or a live model is selected.

## Optional live model

Use local Claude Code:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

Use Strands with Bedrock:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2
```

Strands also supports `openai` and `openrouter`. Live Step 4 runs write `out/recording.json`; scrub recordings before committing them.

## Inputs and output

Each `phases.json` lists a phase name, prompt, and check. Step 4 can also list skills. Every step writes the website to `out/`; later steps add checkpoints, reports, commits, and recordings.

Read `ISOMORPHISM.md` to see how the Step 4 files map to the production harness.
