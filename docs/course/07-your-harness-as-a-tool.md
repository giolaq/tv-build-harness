# 07. Your Harness As A Tool

## The problem

A harness is useful for humans, but it becomes more valuable when another agent can drive it without reading the source. The tool needs contracts, exit codes, examples, validation, planning, confirmation, detach, status, and logs.

Cost: free for schema, init, validate, plan, status, logs, and replay. Live generation costs depend on model and phase count.

## How this repo solves it

The agent-facing contract lives in `AGENTS.md`. It tells any shell-capable agent how to inspect schemas, scaffold inputs, validate, show a plan, launch a detached run, poll status, and read logs.

The CLI entry point is `packages/harness/src/index.ts:72`. It routes short commands such as `schema`, `init`, `validate`, `status`, and `abort`, and long-running commands such as `run`, `claude-run`, and `replay`.

JSON output is written through `packages/harness/src/output.ts:1`. Every machine-readable payload includes `schemaVersion: 1`, and errors include `code`, `message`, and `hint`.

Input schemas are shared through `packages/harness/src/input-schemas.ts:1`. The docs generator in `scripts/gen-input-docs.ts` and the `schema` command use the same registry, so agents and docs do not drift apart.

Validation warnings live in `packages/harness/src/validate.ts:22`. They are the retry feedback for the authoring loop: sparse rails, too many rails, low contrast, missing prompt, and non-HTTPS URLs.

Detached run state is read by `packages/harness/src/status.ts:1`. An agent can survive shell timeouts by launching with `--detach --yes --json`, then polling `status` and tailing `logs`.

Targeted developer feedback is handled by `packages/harness/src/refine.ts:1`. `refine` resolves a run or app directory, inherits the run seed, rebuilds the original phase concern, runs that phase's verify checks, and commits only on success.

The loop recurses:

1. Schema is a strong prior.
2. Validation is mechanical verification.
3. Warnings and hints are retry context.
4. Examples are knowledge injection.
5. Plan plus confirmation is the plan-before-execute gate.
6. Status, logs, report, replay, and commits make the run observable.

Decision record: CLI, not MCP.

Use the CLI as the public protocol. Agents already have shells, Unix streams, exit codes, files, and JSON parsers. `schema --json`, NDJSON events, deterministic exit codes, and `AGENTS.md` compose across Claude Code, Gemini CLI, OpenClaw, Hermes, and ordinary scripts. Revisit MCP only if a real consumer cannot use shell access.

Decision record: no memory layer in v0.3.

Do not add run memory until there is evidence. The current harness already carries bounded-run state through the resolved phase plan, per-phase commits, retry context, checkpoint/resume, logs, recordings, and reports. If later phases start contradicting earlier accepted decisions, file an issue with evidence and prefer the lightest fix: append a per-run decisions file into later phase context.

## Three tempos

A useful harness has more than one loop, and loops of different tempos must not block each other.

The fast loop is inside a phase. The model edits, verification checks fail or pass, and retry context feeds the next attempt. The human is not interrupted because this loop is mechanical and bounded. In this repo the mechanism is `packages/harness/src/pipeline-engine.ts:1`, phase verify checks in `packages/harness/src/harness-config.ts:1`, and NDJSON events such as `verify_failed` and `retry`.

The developer loop happens between runs. A person reads the plan, report, screenshots, or app, then gives steering feedback. `--detach` keeps the long run out of the human's way. The plan gate keeps expensive work explicit. `refine` gives feedback a matching lever: amend one phase concern in the current app instead of paying for a full rerun.

The outer loop happens days later through versioned inputs. Edit `content.json`, `brand.json`, `prompt.txt`, `design.json`, or `harness.config.json`, pin `--seed`, run again, and diff the result. Inputs are the durable spec; generated files under `out/` are artifacts.

These three mechanisms deliberately sit at different speeds:

- `--detach` lets long work continue without holding the agent shell.
- The plan gate forces the agent to show the human phase and cost before live work.
- Versioned inputs make later reruns explicit and reviewable.

Decision record: refine amends, it does not rewind.

`tv-build refine <runId|appDir> --phase branding "warmer palette"` runs against the app's current state. It reuses the original phase prompt, the run spec, the creative seed, the developer instruction, and discovery-first rules. Rewinding to the old phase commit is a non-goal because it can destroy later manual edits and costs close to a rerun. The escape hatch is a full rerun with edited inputs and a pinned seed.

## Exercise

Drive the harness as an agent would:

```sh
cd packages/harness
npx tsx src/index.ts schema --json
npx tsx src/index.ts init my-inputs
npx tsx src/index.ts validate my-inputs --json
npx tsx src/index.ts claude-run my-inputs --plan --json
```

Cost: free.

Show the plan and state that execution is uncapped. Only after confirmation, launch the run:

```sh
npx tsx src/index.ts claude-run my-inputs --detach --yes --json
npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId>
```

Cost: live model cost, tracked but uncapped.

Read `docs/course/demos/agent-drives-harness/README.md` and compare its transcript with `AGENTS.md`.

Now inspect the refine loop:

```sh
npx tsx src/index.ts refine <runId> --phase branding "warmer palette, larger hero cards" --plan --json
```

Cost: free for `--plan`; live model cost for execution is tracked but uncapped.

Read the plan output. Identify the phase concern, inherited seed, verify checks, and the amend-vs-rewind non-goal. The keyed replay fixture for a real refine session is deferred until a full-harness recording is regenerated with a model key.

## Check yourself

Why is `schema --json` part of the authoring loop?

<details><summary>Answer</summary>

It lets an agent inspect the current input contract directly from the tool instead of relying on stale prose.

</details>

Why does detached mode require `--yes` in JSON mode?

<details><summary>Answer</summary>

It forces the agent to show the plan and cost to the human before launching a live, potentially expensive run.

</details>

What is the smallest evidence that would justify adding memory later?

<details><summary>Answer</summary>

A concrete failure class, such as later phases repeatedly contradicting earlier accepted decisions despite checkpoints, commits, and retry context.

</details>

When should an agent choose `refine` instead of a full rerun?

<details><summary>Answer</summary>

When the requested change is scoped to one phase concern, such as branding, content, screens, creative UI, or navigation, and the current app should be amended in place.

</details>
