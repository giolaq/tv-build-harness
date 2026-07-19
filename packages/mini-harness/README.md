# Mini Harness

This package is workshop material. It builds the same idea four times, adding one harness concept per step until the final version mirrors the real TV Build architecture.

Run commands from `packages/mini-harness`.

## The Four Steps

| Step | What it teaches | Run it |
| --- | --- | --- |
| `01-single-agent` | Prompt -> model -> write files. No verification. | `npx tsx steps/01-single-agent/index.ts run fixtures/phases.json --replay fixtures/demo-recording.json` |
| `02-verify-loop` | Add `file_exists`/`grep` checks and retry with failure text. | `npx tsx steps/02-verify-loop/index.ts run fixtures/phases.json --replay fixtures/retry-recording.json` |
| `03-phases` | Add config loading, a phase loop, checkpoints, run context, reports, and git commits. | `npx tsx steps/03-phases/index.ts run fixtures/phases.json --replay fixtures/retry-recording.json` |
| `04-skills` | Add skills, prompt assembly, executor interface, and record/replay. | `npx tsx steps/04-skills/index.ts run fixtures/phases.json --replay fixtures/retry-recording.json` |

The invocation shape stays the same:

```sh
npx tsx steps/<step>/index.ts run fixtures/phases.json --replay fixtures/retry-recording.json
```

## Existing Course Command

The old entrypoint still works. It now runs step 04:

```sh
yarn dev --phases fixtures/phases.json --replay fixtures/demo-recording.json
```

## Live Run

Every step uses the same supplied model runtime. The default is local Claude Code:

```sh
npx tsx steps/04-skills/index.ts run fixtures/phases.json --executor claude-cli --model sonnet
```

Use a remote model through Strands instead:

```sh
npx tsx steps/04-skills/index.ts run fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 --region us-west-2
```

Supported Strands providers are `bedrock`, `openai`, and `openrouter`. No step imports the Anthropic SDK. To use Claude, choose local Claude Code or a Claude model through Bedrock/OpenRouter. The live step-04 run writes `out/recording.json`; scrub it before committing.

## Inputs

`phases.json` is intentionally small:

```json
{
  "phases": [
    {
      "name": "content",
      "prompt": "Add the required show title.",
      "verify": { "type": "grep", "path": "out/shows.html", "pattern": "Kitchen Stories" },
      "skills": ["optional-skill-name"]
    }
  ]
}
```

Only step 04 reads `skills`. Steps 01-03 ignore that field.

## Output

Every step writes a static site under `./out`. Later steps also write checkpoints, git commits, reports, and recordings.

Read `ISOMORPHISM.md` to map step-04 files to the real harness modules.
