# TV Build Agent Guide

This file is for agents driving `tv-build` as a tool. For contributors editing this repository, read `CLAUDE.md`.

TV Build turns a small input directory into a generated TV app through planned phases, prompts, skills, verification checks, logs, reports, and replay.

## Authoring Loop

Use this loop when a human asks you to create a TV app input set.

```sh
cd packages/harness
npx tsx src/index.ts schema --json
npx tsx src/index.ts init my-inputs
npx tsx src/index.ts validate my-inputs --json
npx tsx src/index.ts claude-run my-inputs --plan --json
# Show the human the plan, expected platforms, and max-cost setting.
npx tsx src/index.ts claude-run my-inputs --detach --yes --json --max-cost 10
npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId>
```

## Required Files

- `content.json`: catalog title, description, categories, videos, and featured ids.
- `brand.json`: brand name, colors, font, logo, and splash paths.
- `prompt.txt`: the human's app-specific intent and constraints.

Optional files:

- `design.json`: layout, focus, spacing, tile, and mood preferences.
- `screens.json`: explicit navigation and screen tree.
- `run.json`: target platforms and run settings.
- `harness.config.json`: custom template, phases, models, checks, and budgets.

Inspect exact contracts with:

```sh
npx tsx src/index.ts schema content --json
npx tsx src/index.ts schema brand --json
npx tsx src/index.ts schema config --json
```

## Validation

Run validation until `errors` is empty.

```sh
npx tsx src/index.ts validate my-inputs --json
```

Warnings do not block a run, but you should address them before asking for confirmation when they affect quality:

- `sparse_rail`: add at least 3 items to each rail.
- `too_many_rails`: reduce or group rails.
- `brand_contrast`: improve foreground/background contrast.
- `missing_prompt`: add `prompt.txt`.
- `non_https_url`: use HTTPS or local placeholder assets.

## Plan Gate

Always show the human the plan and cost cap before launching a live run.

```sh
npx tsx src/index.ts claude-run my-inputs --plan --json
```

Do not run without `--yes` after confirmation. In JSON mode, detached runs require it.

```sh
npx tsx src/index.ts claude-run my-inputs --detach --yes --json --max-cost 10
```

Set `--max-cost` explicitly. Non-example inputs default to `$10`, but you should still state the cap to the human. If a run exits `4` with `reason: "budget"`, report that to the human. Do not raise the cap yourself.

## Status Loop

Detached runs return:

```json
{"schemaVersion":1,"command":"detach","runId":"abcd1234","pid":12345,"out":".../out/abcd1234"}
```

Poll status:

```sh
npx tsx src/index.ts status abcd1234 --json
```

Read logs:

```sh
npx tsx src/index.ts logs abcd1234
npx tsx src/index.ts logs abcd1234 --follow
```

Abort only when the human asks or the run is clearly wrong:

```sh
npx tsx src/index.ts abort abcd1234 --json
```

Never edit files under `out/`. They are generated artifacts, logs, reports, and checkpoints.

## Exit Codes

| Code | Meaning | What you do |
| --- | --- | --- |
| 0 | Success | Continue the loop. |
| 1 | Input or validation error | Fix input files, then rerun `validate`. |
| 2 | Run failed after retries | Read `status` and `logs`, then report the failing phase. |
| 3 | Environment or doctor error | Run `doctor --fix` once, then stop and report. |
| 4 | Aborted | Report the reason. Do not resume or raise budget without approval. |

## JSON Events

Long-running commands emit NDJSON on stdout when `--json` is set. Every line has `schemaVersion: 1`.

Events:

- `run_start`
- `phase_start`
- `phase_message`
- `tokens`
- `iteration`
- `phase_complete`
- `run_complete`

Short commands emit one JSON object: `schema`, `init`, `validate`, `doctor`, `status`, and `abort`.

Errors use:

```json
{"schemaVersion":1,"error":{"code":"...","message":"...","hint":"..."}}
```

## Gotchas

Schemas cannot tell whether the content density feels good on a TV. Use validation warnings and examples as the quality floor.

Schemas cannot guarantee brand colors are legible in every generated layout. Treat contrast warnings as real.

Put structured catalog facts in `content.json`. Put taste, audience, product goals, and constraints in `prompt.txt`.
