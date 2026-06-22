---
name: expo-tv-config
description: Expo TV configuration: app.json plugins, prebuild settings, platform-specific config for react-native-tvos
applies_to: [phase_clone, phase_prebuild]
load_when: configuring `app.json`, running prebuild, or builds fail with config errors
---

# Expo TV configuration

> The Expo plugin `@react-native-tvos/config-tv` is the single switch that makes an Expo app build for TV. Get this wrong and you ship a phone app to a TV launcher. Get it right and most platform-specific config is automatic.

## The one environment variable that matters

```bash
EXPO_TV=1
```

This **must** be set when:
- Running `expo prebuild`
- Running `expo run:android` or `expo run:ios` for a TV build
- Running EAS Build for a TV profile

Without it, the plugin no-ops and you get a mobile build. The `expo_prebuild` tool always sets it; if a user invokes prebuild manually, the symptom is silent — the build succeeds but the app is wrong.

A handy `.envrc` (direnv) or shell alias avoids forgetting:
```bash
export EXPO_TV=1
```

## Plugin options

```json
[
  "@react-native-tvos/config-tv",
  {
    "isTV": true,
    "androidTVBanner": "./assets/icon-400x240.png",
    "showVerboseWarnings": false
  }
]
```

- `isTV: true` — required. Drives Android leanback config and tvOS deployment target.
- `androidTVBanner` — path to the 400×240 banner. Required for Android TV / Fire TV. See `firetv-leanback.md`.
- `showVerboseWarnings` — verbose prebuild output. Useful when debugging.

## What the plugin does (so you know what NOT to do manually)

On Android:
- Adds `<intent-filter>` with `LEANBACK_LAUNCHER` to the main activity
- Adds `<uses-feature android:name="android.software.leanback" android:required="false" />`
- Adds `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`
- References the banner in the application tag

On iOS:
- Sets deployment target to tvOS
- Switches the Xcode target to Apple TV
- Adjusts Info.plist for TV (removes phone-only keys)

**This is why you don't edit native files directly.** Anything the plugin does, the plugin owns. Manual edits get clobbered on the next prebuild.

## Prebuild — when and why

```bash
EXPO_TV=1 npx expo prebuild --clean
```

`--clean` regenerates `ios/` and `android/` from scratch. This is what you want in CI and in the harness — reproducible builds. Without `--clean`, prebuild merges into existing native files and merge conflicts are silent and weird.

### When to prebuild

- After changing `app.json` (any field).
- After adding or removing a config plugin.
- After bumping `expo` SDK or `react-native-tvos`.
- After changing the banner or icon.

### When NOT to prebuild

- After changing only JS/TS code in `packages/shared-ui` or `apps/expo-multi-tv/src/`. JS bundles don't require regeneration.
- After updating a non-native dependency. Prebuild is for native config; JS deps don't need it.

Unnecessary prebuilds cost 60–120s and risk wiping any custom native edits (which the agent shouldn't have made, but).

## SDK version pin

The template ships with Expo SDK 51 and `react-native-tvos@0.74-stable` (or whatever the README states — verify on clone). Compatibility table:

| Expo SDK | react-native-tvos version | Notes |
|----------|---------------------------|-------|
| 51 | `0.74-stable` | Template default |
| 52 | `0.76-stable` | Newer; verify all deps |
| 54 | `0.81-stable` | Latest at time of writing; newest TV features |

If the user requests a newer SDK, bump deliberately:
1. Update `expo` and `react-native` (the alias to `react-native-tvos`) in **both apps**.
2. Update transitive deps that have SDK constraints (`expo-router`, `expo-font`, etc.).
3. `yarn install`.
4. `expo prebuild --clean`.
5. Build for each platform; expect to fix 1–3 small issues per major SDK bump.

The agent should not silently bump. SDK changes are visible diffs.

## EAS profile (when EAS Build is in use)

```json
// eas.json
{
  "build": {
    "preview-tv-android": {
      "extends": "preview",
      "env": { "EXPO_TV": "1" },
      "android": { "buildType": "apk" }
    },
    "preview-tv-ios": {
      "extends": "preview",
      "env": { "EXPO_TV": "1" },
      "ios": { "simulator": false }
    }
  }
}
```

`env.EXPO_TV` is the equivalent of the shell variable. Without it on EAS, you get a mobile build out of the cloud — same symptom as locally.

## Common config errors and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Mobile-looking app on a TV target | `EXPO_TV` not set during prebuild | Re-run with the env var, `--clean` |
| Prebuild fails: "android resource not found" | Banner path wrong in `app.json` | Fix path; rerun prebuild |
| Prebuild succeeds but app crashes on launch | SDK / `react-native-tvos` version mismatch | Align versions per the table above |
| `expo run:ios` builds a phone app | Xcode scheme is the phone target | Open `ios/`, switch scheme to the `-tvOS` variant, or use `expo run:ios --device <TV-simulator>` |
| "Plugin not found: @react-native-tvos/config-tv" | Plugin not installed in the app's workspace | `yarn workspace expo-multi-tv add @react-native-tvos/config-tv` |
| Banner appears stretched | Wrong dimensions, not exactly 400×240 | Regenerate at correct size |

## When to update plugins vs runtime

Plugin updates → require prebuild.
Runtime JS updates → don't.

If a plugin update is included in a normal `yarn` and the agent forgets to prebuild afterward, the build will succeed but the change won't take effect on native. Always prebuild after a plugin change.

## Anti-patterns

- **Setting `EXPO_TV` inside the JS code.** It's a build-time variable. Setting it at runtime does nothing.
- **Editing `ios/` or `android/` directly to "fix" something.** Prebuild will erase it. If a fix is needed, write or extend a config plugin.
- **Skipping `--clean` during prebuild because "it's faster".** It is faster. It's also the source of half of the "works on my machine" bugs.
- **Running `expo run:ios` when an iPhone simulator is open.** The build may target the phone. Specify the TV device or close the phone simulator first.
