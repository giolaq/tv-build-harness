---
name: eas-build
description: Expo Application Services cloud build configuration for TV app APK and IPA generation
applies_to: [phase_eas_build]
load_when: producing signed artifacts via EAS, or local builds aren't sufficient
---

# EAS Build for TV

> Local builds are great for fast iteration. EAS builds are required for: signed artifacts, builds reproducible in CI, and store submission. The TV story on EAS is the same as mobile with one extra: the `EXPO_TV` env var per profile.

## Profiles for TV

In `eas.json`:

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "preview-tv-android": {
      "extends": "preview",
      "env": { "EXPO_TV": "1" },
      "android": { "buildType": "apk" },
      "distribution": "internal"
    },
    "preview-tv-firetv": {
      "extends": "preview-tv-android",
      "env": { "EXPO_TV": "1" }
    },
    "preview-tv-ios": {
      "extends": "preview",
      "env": { "EXPO_TV": "1" },
      "ios": {
        "simulator": false,
        "image": "latest"
      },
      "distribution": "internal"
    },
    "production-tv-android": {
      "env": { "EXPO_TV": "1" },
      "android": { "buildType": "app-bundle" },
      "distribution": "store"
    },
    "production-tv-ios": {
      "env": { "EXPO_TV": "1" },
      "ios": { "simulator": false },
      "distribution": "store"
    }
  }
}
```

Why two Android profiles? Fire TV and Android TV produce the same APK technically, but Fire TV gets distributed via the Amazon Appstore and Android TV via Google Play. The profiles differ in store metadata, not in the build. Keep them separate so submission later is clean.

## Build invocation

```bash
# From apps/expo-multi-tv/
eas build --profile preview-tv-android --platform android
eas build --profile preview-tv-ios --platform ios
```

The `eas_build` tool wraps these. Each build is 10–25 min on EAS infra. Don't wait synchronously in the harness — kick it off, return the build ID, poll status, or use webhooks.

## Vega is NOT built via EAS

EAS doesn't currently support Vega. Vega builds go through Amazon's Vega CLI / Kepler toolchain. The `vega_build` tool handles it. EAS profiles in `eas.json` are for the Expo app only.

## Simulator vs device builds (iOS / tvOS)

- `"simulator": true` produces a build runnable in the tvOS Simulator (.tar.gz with .app inside). Fastest, no Apple Developer account needed.
- `"simulator": false` produces a `.ipa` runnable on a real Apple TV or for TestFlight. Requires Apple Developer membership and provisioning.

For the harness:
- **Smoke testing in CI** → simulator build.
- **Internal sharing to a real TV** → device build, internal distribution.
- **Store submission** → device build, store distribution.

## Credentials

On first build, EAS prompts for credentials:
- **Android:** keystore (let EAS generate one and store it, or upload your own).
- **iOS / tvOS:** Apple Developer account, distribution cert, provisioning profile. Let EAS manage these unless the user has a specific reason not to.

The harness should **not** prompt interactively in v1. Either:
- Pre-configure credentials before the run, and let EAS reuse them silently.
- Skip EAS entirely if credentials aren't set up, and produce local artifacts only.

## Build artifacts and where they end up

EAS builds finish on Anthropic's — sorry, Expo's — servers. Get artifacts via:

```bash
eas build:list --status finished --json --limit 1
```

Or via the API. The `eas_build` tool downloads the artifact URL and saves to `out/<run_id>/artifacts/`.

## Common EAS failures and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Build fails: "Plugin not found" | `@react-native-tvos/config-tv` not in deps | Add to the workspace, commit, retry |
| Build succeeds but app is a phone app | `EXPO_TV` env var missing from profile | Add `"env": { "EXPO_TV": "1" }` |
| iOS build fails: "no provisioning profile" | Credentials not configured | Run `eas credentials` once, then retry |
| Android build fails: "keystore not found" | Keystore deleted from EAS or never generated | `eas credentials` to regenerate, or upload an existing keystore |
| Long queue times | Free tier or busy infra | Either accept it, or use a paid plan |
| Build times out | Workspaces install loop, or a native dep needs a slow native build | Investigate logs; sometimes a `metro.config.js` issue |

## CI integration (out of v1 scope, but flag)

EAS integrates with CI via the EAS CLI. Most teams set up:
- Push to `main` → preview build for both platforms.
- Tag a release → production build, auto-submit to internal track.

The harness produces an EAS-ready repo. Wiring it into CI is the user's next step.

## Cost — be aware

EAS is metered. Free tier covers small teams; busier projects need a paid plan. A typical harness run with `production-tv-android` + `production-tv-ios` + `preview-tv-firetv` = 3 builds. Multiply by users / iterations.

For dev runs, prefer **local builds** via `expo run:*`. EAS only when you need a real artifact.

## Decision: EAS or local build?

| Need | Use |
|------|-----|
| Run on simulator/emulator | Local (`expo run:*`) |
| Run on a real Apple TV for the first time | EAS preview-tv-ios (device, internal) |
| Run on a real Fire TV / Android TV for the first time | Local (`expo run:android` + adb) is usually faster |
| Signed APK for sharing | EAS preview-tv-android |
| Store submission | EAS production-* |
| Vega artifact | `vega_build` tool, not EAS |

## Anti-patterns

- **Running EAS for every smoke test.** Each is 10–25 min and metered. Local is seconds.
- **Forgetting `EXPO_TV` in production profiles.** Same symptom as forgetting it locally — phone app on a TV.
- **Bundling Vega target into EAS profiles.** Vega is a different toolchain; EAS won't know what to do.
- **Mixing dev and prod credentials.** Use distinct keystores / provisioning per environment.
