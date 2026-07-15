# TV Build for Beginners

TV Build is a harness for using an AI coding agent to build TV applications.

You do not ask a model to make an entire app in one large prompt and hope for the
best. You give TV Build a small, structured description of the app. It plans the
work, gives the model TV-specific instructions, checks each phase, retries a
failed phase once, and records what happened.

## What TV Build can do

- Generate a React Native TV app from catalog content, brand information, and a
  written product brief.
- Guide the agent through phases such as scaffolding, branding, content,
  navigation, verification, and build loops.
- Provide TV-specific knowledge for D-pad navigation, focus management, and
  10-foot UI design.
- Check work after every phase and feed failures back into one retry.
- Commit successful phases in the generated app's Git repository.
- Stop work when it reaches a cost cap.
- Run in the background and expose progress, logs, and abort controls.
- Replay committed recordings without a model key.
- Refine one concern, such as branding, without rerunning the entire pipeline.
- Build, install, launch, and inspect an Android TV app through Gradle, ADB,
  screenshots, and Logcat.

## The basic flow

```text
input files -> validate -> plan -> generate phase by phase -> verify -> report
```

The input files are the app specification. The generated files, logs,
checkpoints, and report are written to `packages/harness/out/<runId>/`.

## First run

Start in the harness package:

```sh
cd packages/harness
yarn install
npx tsx src/index.ts doctor
```

Create a starter input directory:

```sh
npx tsx src/index.ts init my-tv-app
```

It creates these important files:

- `content.json`: catalog titles, categories, and media items.
- `brand.json`: app name, colors, fonts, and image paths.
- `prompt.txt`: the audience, visual taste, and product constraints.

You can also add `design.json`, `screens.json`, `run.json`, and
`harness.config.json` when you need more control. Inspect their exact shapes
with `schema`:

```sh
npx tsx src/index.ts schema content --json
npx tsx src/index.ts schema config --json
```

## Validate before a live run

```sh
npx tsx src/index.ts validate my-tv-app --json
```

Fix every item under `errors`. Warnings do not prevent a run, but treat them as
quality feedback. For example, TV Build warns about rails with too few items,
low brand contrast, insecure asset URLs, and instructions accidentally placed
inside content data.

## Plan, then confirm

Before spending model tokens, inspect the resolved pipeline:

```sh
npx tsx src/index.ts claude-run my-tv-app --plan --json
```

Review the phase list and cost cap with the person requesting the app. Then
start the run in the background:

```sh
npx tsx src/index.ts claude-run my-tv-app \
  --detach --yes --json --max-cost 10
```

The command returns a `runId`. A non-example input has a default cap of $10,
but always set and communicate a cap explicitly.

## Follow a run

```sh
npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId>
npx tsx src/index.ts logs <runId> --follow
```

Use `abort <runId>` only when the requester asks, or the run is clearly working
on the wrong thing. Do not edit files under `out/`; they are generated records.

## Refine instead of rerunning

When the app is broadly correct and the requested change belongs to one phase,
use `refine`:

```sh
npx tsx src/index.ts refine <runId> \
  --phase branding "make the palette warmer and the hero cards larger" \
  --plan --json
```

Show that plan first. Then execute the focused pass:

```sh
npx tsx src/index.ts refine <runId> \
  --phase branding "make the palette warmer and the hero cards larger" \
  --yes --json --max-cost 3
```

Refine changes the app as it is now. It does not rewind to an earlier phase,
because that could discard later work. It runs the selected phase's checks and
commits only when they pass.

## Test an Android TV app

Install the official Android CLI, update it, and install its agent skill:

```sh
android update
android init
```

Start an Android TV emulator or connect a device. Then preview the Android
actions and agent setup:

```sh
npx tsx src/index.ts android <runId|appDir> --setup-agent --plan --json
```

To build, install, launch, send basic remote input, take a screenshot, and
collect logs:

```sh
npx tsx src/index.ts android <runId|appDir> \
  --setup-agent --require-android-cli \
  --build --install --launch --test --logs --yes --json
```

TV Build uses Android CLI to describe the project, deploy and launch the APK,
inspect layouts, and capture screenshots. Gradle builds the APK. ADB is used
only for device/boot discovery, remote key events, and Logcat because Android
CLI does not currently expose those operations. TV Build writes an
`android-handoff.json` file that tells you what backend and project to use in
Android Studio, including the module, Gradle tasks, APK path, device, artifacts,
and most recent failure.

Use `docs/android-cli-workflow.md` for the complete command sequence,
presentation demo, artifact map, compatibility behavior, and troubleshooting.

## Learn without a model key

Replay a teaching fixture:

```sh
npx tsx src/index.ts replay cooking-shows --json --speed 50
```

Replay is useful for a workshop, a presentation, or learning how the harness
behaves without calling a model.

## Exit codes

| Code | Meaning | Next step |
| --- | --- | --- |
| `0` | Success | Continue. |
| `1` | Input or validation error | Fix inputs and validate again. |
| `2` | Run or refine failed after retries | Read status and logs. |
| `3` | Environment error | Run `doctor --fix` once, then report the result. |
| `4` | Aborted, often due to budget | Report why it stopped; do not raise the cap without approval. |

For the complete machine-readable agent contract, read `AGENTS.md`. For local
validation and workshop preparation, use `docs/run-and-test.md`.
