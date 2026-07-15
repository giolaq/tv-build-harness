# Android CLI Workflow

Use this guide to run, explain, and demonstrate TV Build's Android path.

The central design rule is:

> The harness controls the agentic pipeline. Android CLI controls the Android
> platform. Gradle builds the APK. ADB fills only the remaining device gaps.

This boundary keeps Android behavior explicit and inspectable. The model does
not invent install commands, guess APK paths, or scrape Android Studio output.

## What Android CLI owns

TV Build prefers the official
[Android CLI](https://developer.android.com/tools/agents/android-cli) for every
operation it supports.

| Responsibility | Command |
| --- | --- |
| Confirm SDK configuration | `android info` |
| Install Android knowledge for agents | `android init` and `android skills ...` |
| Read official Android guidance | `android docs search` and `android docs fetch` |
| Discover project targets and artifacts | `android describe` |
| List and start virtual devices | `android emulator list/start` |
| Install and launch an APK | `android run` |
| Inspect UI and focused elements | `android layout` |
| Capture visual evidence | `android screen capture` |
| Ask Android Studio for semantic analysis | `android studio ...` |

Android CLI's `run` command expects an APK; it does not compile one. TV Build
therefore uses the generated project's Gradle wrapper for compile and assemble.

Android CLI currently has no command for connected-device selection, boot
properties, D-pad key events, or Logcat. TV Build uses a bounded ADB fallback
only for those operations.

## Install and initialize

Download Android CLI from the official Android developer page. Confirm it is on
your `PATH`, update it, and install its agent skill:

```sh
command -v android
android update
android init
android skills list --long
```

`android init` installs or updates the `android-cli` skill for detected agents.
Run it once after installation and again when you update Android CLI.

Check the complete TV Build environment:

```sh
cd packages/harness
npx tsx src/index.ts doctor --fix
```

The doctor reports Android CLI separately from the Android SDK and Android TV
AVD. If Android CLI is absent, normal runs can use the compatibility path. For
a workshop or demonstration, use `--require-android-cli` so the fallback cannot
hide a setup problem.

## Plan before touching a device

First inspect the lifecycle without executing it:

```sh
npx tsx src/index.ts android <runId|appDir> \
  --setup-agent \
  --start-emulator <tv-avd-name> \
  --require-android-cli \
  --build --install --launch --test --logs \
  --plan --json
```

The plan shows:

- the resolved app directory and technology stack;
- the Gradle module, variant, tasks, and configured APK path;
- Android CLI as the preferred backend;
- the narrow ADB fallback policy;
- whether Android CLI is required;
- every lifecycle step before execution.

Show this plan before running it. This is the same confirmation pattern used by
live model runs: expensive or device-changing work stays outside the autonomous
loop.

## Execute the lifecycle

After confirmation, add `--yes` and remove `--plan`:

```sh
npx tsx src/index.ts android <runId|appDir> \
  --setup-agent \
  --start-emulator <tv-avd-name> \
  --require-android-cli \
  --build --install --launch --test --logs \
  --yes --json
```

Use `--device <serial>` when more than one device is connected. Use
`--flow <path>` to run an asserted D-pad flow instead of the default remote
actions.

The lifecycle runs in this order:

```text
android info
  -> android init / skills list
  -> android describe
  -> android emulator start (optional)
  -> ADB device and boot check
  -> Gradle compile and assemble
  -> android run
  -> D-pad actions
  -> android layout
  -> android screen capture
  -> Logcat when requested or on failure
  -> android-handoff.json
```

`android run` installs and launches in one operation. When both `--install` and
`--launch` are present, TV Build does not deploy twice.

## What the Android phase teaches the agent

The `android_test_loop` phase loads two layers of knowledge:

1. The repository skill at `skills/android-tv-testing/SKILL.md` explains TV
   focus behavior, the command ownership boundary, evidence, and failure modes.
2. `android init` installs Google's current `android-cli` skill so the agent can
   use the CLI according to the installed version.

The phase prompt requires the agent to use Android CLI for project discovery,
deployment, layout inspection, screenshots, documentation, skills, emulator
management, and Android Studio integration. It permits Gradle and ADB only for
the documented gaps.

If a test fails, the phase may fix source and retry up to three build/test
cycles. It preserves the focus system and records evidence for each iteration.

## Evidence and Android Studio handoff

TV Build writes Android evidence beside the run:

| Artifact | Purpose |
| --- | --- |
| `android/android-describe.txt` | Raw Android CLI project description. |
| `android/android-describe.json` | Normalized metadata files and discovered APK. |
| `android/layout.json` | Latest Android CLI UI hierarchy used for focus checks. |
| `android/*.png` | Device screenshots captured through Android CLI. |
| `android/logcat.txt` | ADB Logcat fallback for diagnosis. |
| `android/dpad-flow.json` | Step-by-step asserted D-pad result when a flow is supplied. |
| `android-handoff.json` | Backend, project, Gradle tasks, APK, device, artifacts, and last failure. |

Open the project path from `android-handoff.json` in Android Studio. If Android
Studio Quail 2 Canary 1 or newer is running with Gemini enabled, Android CLI can
also connect directly:

```sh
android studio check
android studio analyze-file app/src/main/java/.../MainActivity.kt
android studio find-declaration --short MainActivity
android studio find-usages --short MainActivity
```

For a Compose project, `android studio render-compose-preview` can return both a
rendered image and the accessibility semantics tree.

## Compatibility behavior

Without `--require-android-cli`, TV Build probes `android info`. If the CLI is
unavailable, it records `gradle-adb` as the backend and uses the previous
compatibility implementation. The handoff and JSON completion event always say
which backend actually ran.

Use compatibility mode for gradual adoption. Do not use it in a presentation,
golden platform run, or CI claim intended to prove Android CLI integration.

## Presentation demo

Use this sequence for a predictable Android segment.

1. Show `doctor --json` and point out that the SDK, Android CLI, and TV AVD are
   separate capabilities.
2. Run `android emulator list` to show the platform is controlled through one
   official interface.
3. Run the TV Build command with `--plan --json`. Highlight `preferred`,
   `requireAndroidCli`, Gradle tasks, and the ordered steps.
4. Run the confirmed command. Explain the boundary while the build runs:
   harness for orchestration, Gradle for compilation, Android CLI for platform
   operations, ADB only for remote input and logs.
5. Open `android-handoff.json`, the screenshot, and layout evidence. This is the
   trust moment: the output is evidence, not an agent saying “it works.”
6. If compilation or focus verification fails, keep the failure in the demo.
   Show that downstream installation stops and the handoff identifies the exact
   failed step.

A useful slide headline is: **Give the agent official platform tools, then make
the harness enforce when and how they are used.**

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `Android CLI is required but unavailable` | Install it, run `android update`, then `android init`. |
| No TV emulator | Run `android emulator create --list-profiles`, create a TV profile, then list it. |
| More than one device | Pass `--device <serial>`. |
| APK path is wrong | Inspect `android-describe.txt` and `android-describe.json`; do not guess a different path silently. |
| Gradle compilation fails | Fix the product source; Android CLI cannot deploy an APK that was not built. |
| App installs but focus is stuck | Inspect `layout.json` and `dpad-flow.json`; compare focused nodes before and after input. |
| App crashes | Inspect `logcat.txt`; Logcat is an intentional ADB fallback. |
| Android Studio command fails | Run `android studio check` and verify the required Studio preview version and Gemini sign-in. |
