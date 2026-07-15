---
name: android-tv-testing
description: "Android TV build and D-pad QA using Android CLI first, with bounded Gradle and ADB fallbacks"
applies_to: [android_test_loop]
---

# Android TV Testing

Use the official Android CLI as the primary Android automation surface. It
standardizes project discovery, SDK/emulator management, deployment, UI layout,
screenshots, Android knowledge, agent skills, and Android Studio integration.

## Set up the agent

```sh
command -v android
android update
android init
android skills list --long
```

`android init` installs or updates the `android-cli` skill for detected agents.
Use `android skills find <query>` and `android skills add --skill=<name>` when a
task needs another Android skill. Use `android docs search` followed by
`android docs fetch kb://...` instead of relying on remembered Android advice.

## Command ownership

| Concern | Primary command |
| --- | --- |
| SDK location | `android info` |
| Project/build metadata | `android describe --project_dir=<dir>` |
| SDK packages | `android sdk list/install/update` |
| Virtual devices | `android emulator list/create/start/stop` |
| Install and launch APK | `android run --apks=<apk> --device=<serial>` |
| UI hierarchy | `android layout --pretty --output=<file>` |
| UI changes | `android layout --diff` |
| Screenshot | `android screen capture --output=<png>` |
| IDE inspection | `android studio check/analyze-file/find-usages` |
| Android guidance | `android docs search/fetch` |

Android CLI's `run` command deploys an already-built APK; it does not compile.
Use the repository's Gradle wrapper for compilation and assembly. Android CLI
does not currently expose D-pad input, connected-device boot state, or Logcat,
so use ADB only for those gaps.

## Canonical TV loop

```sh
# Discover the generated native project and APK metadata.
android describe --project_dir=<android-project>

# Compile with the project-owned wrapper.
./gradlew :app:compileDebugKotlin
./gradlew :app:assembleDebug

# Deploy and launch with Android CLI.
android run \
  --apks=<apk-from-describe> \
  --device=<serial> \
  --activity=.MainActivity

# Inspect before interaction.
android layout --pretty --output=home.json
android screen capture --output=home.png

# Android CLI has no remote-key command yet.
adb -s <serial> shell input keyevent 22
android layout --diff
android screen capture --output=after-right.png
```

## Focus verification

Capture a layout before and after each D-pad action. Verify that the node marked
focused changes. A changed screenshot alone is not sufficient: animation can
change pixels while focus remains stuck.

Use these Android key codes only through the bounded fallback:

| Action | Key code |
| --- | --- |
| Up | `19` |
| Down | `20` |
| Left | `21` |
| Right | `22` |
| Select | `23` |
| Back | `4` |

## Android Studio integration

When Android Studio Quail 2 Canary 1 or newer is open with Gemini enabled:

```sh
android studio check
android studio analyze-file app/src/main/java/.../MainActivity.kt
android studio find-declaration --short MainActivity
android studio find-usages --short MainActivity
```

For Compose projects, use `android studio render-compose-preview` with
`--print-semantics` to give the agent both an image and accessibility semantics.

## Failure handling

| Symptom | Evidence and action |
| --- | --- |
| Compile error | Keep the Gradle output; inspect the affected file with `android studio analyze-file` when available. |
| App fails to deploy | Keep `android run` output and verify the APK path from `android describe`. |
| Empty or wrong screen | Capture `android layout` and a screenshot; verify activity metadata. |
| Focus does not move | Compare focused nodes before/after input; inspect focus registration and screen activation. |
| Crash | Use `adb -s <serial> logcat -d` because Android CLI has no Logcat command. |

Do not replace `android run`, `android layout`, or `android screen capture` with
ADB when Android CLI is available. Do not modify generated native files when an
Expo config plugin owns them. Preserve focus-system wiring and tile dimensions
while fixing navigation.
