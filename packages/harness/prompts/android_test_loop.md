You are a mobile QA engineer and Android developer. Test the TV app with the
official Android CLI. If you find an app defect, fix it, rebuild, and retest.
Stop after three build/test iterations.

## Tool policy

Use Android CLI wherever it has a command. Do not replace these commands with
hand-written SDK or ADB equivalents:

- Environment and SDK: `android info`, `android sdk ...`
- Agent knowledge: `android init`, `android skills ...`, `android docs ...`
- Project metadata: `android describe`
- Virtual devices: `android emulator ...`
- Install and launch: `android run`
- UI evidence: `android layout`, `android screen capture`
- Android Studio integration: `android studio ...`

The Android CLI does not build APKs. Use the project's Gradle wrapper for
compilation and assembly. Use ADB only for connected-device discovery, boot
state, D-pad key events, and Logcat because Android CLI has no equivalent for
those operations.

## Prerequisites

1. Run `command -v android`. If missing, report that Android CLI must be
   installed from https://developer.android.com/tools/agents/android-cli and
   stop.
2. Run `android info`.
3. Run `android init` to install or update the `android-cli` skill for detected
   agents, then run `android skills list --long`.
4. Run `android describe --project_dir={{appDir}}` and use its project/artifact
   metadata. Do not guess an APK path when metadata is available.
5. Run `android emulator list`. Use an existing Android TV device when one is
   available. Start it with `android emulator start <name>` when needed.
6. Use `adb devices` only to select the connected serial and verify boot with
   `adb -s <serial> shell getprop sys.boot_completed`.

## Iteration loop

Repeat at most three times.

### 1. Build

Use the loaded Android skill to select the correct Gradle task. Run the wrapper
from the described Gradle project. Prefer a debug APK for local testing.

### 2. Deploy and launch

Run:

```sh
android run --apks=<apk-from-describe> --device=<serial> --activity=.MainActivity
```

Use the actual activity from project metadata when it differs. `android run`
installs and launches; do not run `adb install` first.

### 3. Capture initial state

```sh
android layout --pretty --output={{screenshotDir}}/android-iter<ITER>-01-home.json
android screen capture --output={{screenshotDir}}/android-iter<ITER>-01-home.png
```

PASS when the app is visible and the layout contains at least three interactive
or focusable elements. FAIL on an empty layout, launcher screen, or crash.

### 4. Test D-pad behavior

Android CLI currently has no remote-key command, so use the documented ADB
fallback:

```sh
adb -s <serial> shell input keyevent 22
android layout --pretty --output={{screenshotDir}}/android-iter<ITER>-02-right.json
android screen capture --output={{screenshotDir}}/android-iter<ITER>-02-right.png

adb -s <serial> shell input keyevent 20
android layout --pretty --output={{screenshotDir}}/android-iter<ITER>-03-down.json
android screen capture --output={{screenshotDir}}/android-iter<ITER>-03-down.png
```

PASS when the focused node changes after Right and moves to a different row or
section after Down.

### 5. Test navigation

Use Left key events to open the navigation surface, then capture layout and
screenshot evidence with Android CLI. Navigate to the second route from
`{{routesList}}`, select it with keyevent 23, and verify that the layout differs
from Home. Return with keyevent 4. Select the first content card and verify that
a detail or player layout opens.

### 6. Diagnose and retry

Use `android layout --diff` for UI changes. When Android Studio Quail 2 Canary 1
or newer is already open, run `android studio check` and use
`android studio analyze-file` for affected Kotlin/Java files. Use
`android docs search` and `android docs fetch` for Android guidance.

For crashes only, use the ADB fallback:

```sh
adb -s <serial> logcat -d
```

Fix source code, rebuild, and repeat. Preserve the existing focus system and
list item sizing.

## Final report

Report iterations, pass/fail, checks passed, issues found/fixed/remaining,
Android CLI commands used, Gradle task, device serial, and evidence under
`{{screenshotDir}}/android-iter*`. Leave the emulator running for inspection.
