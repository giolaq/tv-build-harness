---
name: firetv-leanback
applies_to: [phase_brand, phase_build]
load_when: targeting `androidtv` or `firetv-fos`
---

# Fire TV / Android TV (leanback)

> Android TV and Fire TV (Fire OS) share the same Android runtime and require the same manifest configuration to be recognized as TV apps by the system. Without these settings, an APK installs but doesn't appear in the TV launcher, or worse: appears with the wrong icon and gets rejected from the store.

This skill covers what `apps/expo-multi-tv/app.json` and the generated `AndroidManifest.xml` must contain.

## The four non-negotiables

For Fire OS / Android TV to recognize the app as a TV app:

1. **`isTV: true`** in the Expo config-tv plugin options.
2. **`androidTVBanner`** asset (exactly 400×240 PNG) referenced from `app.json`.
3. **`LEANBACK_LAUNCHER` intent filter** on the main activity. The plugin generates this when `isTV: true`.
4. **`uses-feature android.software.leanback` (required=false)** in the manifest. Plugin handles it.

If the agent finds itself manually editing `AndroidManifest.xml`, **stop.** The plugin should produce it. Manual edits get wiped on next prebuild.

## `app.json` shape (verified against template)

```json
{
  "expo": {
    "name": "AppName",
    "slug": "app-slug",
    "plugins": [
      [
        "@react-native-tvos/config-tv",
        {
          "isTV": true,
          "androidTVBanner": "./assets/icon-400x240.png"
        }
      ]
    ],
    "android": {
      "package": "com.example.appname",
      "versionCode": 1
    },
    "ios": {
      "bundleIdentifier": "com.example.appname"
    }
  }
}
```

Notes:
- Plugin order matters. `@react-native-tvos/config-tv` should come before any plugin that modifies the Android manifest.
- The Android `package` and iOS `bundleIdentifier` should match your domain. Fire TV store and Apple TV App Store check these.

## Banner specs (the most common bug)

- **Exact dimensions: 400 × 240 pixels.** Not 800×480. Not 200×120. Exact.
- PNG, RGB, no alpha needed (but supported).
- Visually balanced — there is no safe zone padding in the launcher.
- Includes app name as text (the launcher doesn't render the app name beside the banner).

The `replace_assets` tool generates this if not provided. Generation rule:
- Background = `brand.background_color` or `brand.primary_color` (whichever has better contrast with the logo).
- Logo or wordmark centered, fitting within a 360×200 inner area.
- Output to `apps/expo-multi-tv/assets/icon-400x240.png`.

## Fire TV specifics on top of Android TV

Fire TV is Android TV with extra:

- **Amazon Appstore submission** rather than Google Play. Different store entry, different review.
- **No Google Play Services.** If a dep needs Play Services (e.g. some auth libs), it won't work on Fire TV. Audit deps.
- **Different system back behavior.** Long-press Home opens the Amazon overlay. Generally not the app's concern.
- **D-pad center is "select" same as Android TV.** Voice search via remote follows the same intent system.

## Distinguishing Fire OS from Android TV in code (rare)

You usually don't need to. The build artifact is the same APK and runtime APIs are identical. Reach for runtime detection only for:

- Deep-linking that uses Amazon-specific URI schemes.
- Analytics tagging by manufacturer.
- Account integration (Amazon account vs Google account).

If you need it:
```ts
import { NativeModules, Platform } from "react-native";
const isFireOS = Platform.OS === "android" &&
  /amazon/i.test(NativeModules.PlatformConstants?.Manufacturer ?? "");
```

This goes in a single utility file (`isFireOS.android.ts`) — don't sprinkle it.

## D-pad center button = select (the gotcha)

Android TV remote sends `KEYCODE_DPAD_CENTER` for the center press. React TV Space Navigation translates this to a "select" event on the focused element. **It does not translate to `onPress` on a regular `<Pressable>` unless the Pressable is wrapped in a focusable.**

Use the template's themed `<Pressable>` (which is already wrapped) or wrap manually with `<SpatialNavigationFocusableView>`. Don't use `<TouchableOpacity>` — it responds to touch, not to focus + select.

## Prebuild → APK flow

```bash
# In apps/expo-multi-tv/
EXPO_TV=1 npx expo prebuild --platform android --clean
npx expo run:android -d <deviceId>
```

The `-d` is required when multiple emulators / devices are connected, including a phone emulator that may also be running. Forget this and the app installs on the phone.

To find Fire TV device IDs:
```bash
adb devices
# AFTSS, AFTMM, AFTT, etc. are Fire TV model codes
```

To find the leanback emulator:
```bash
emulator -list-avds | grep -i tv
```

## Verifying it's actually a TV build

After install, check:

1. App appears on the **TV launcher home screen** (not just in "Apps" list).
2. Banner image is shown (not the default placeholder).
3. App launches without any "this app may not be optimized for TV" warning.
4. D-pad navigation works on the first screen.

If any of these fail, the manifest is wrong. Most often: `isTV: true` got lost during a custom plugin config merge.

## Common Fire TV / Android TV failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| App doesn't appear on TV home | Missing leanback launcher intent | Verify `isTV: true`, run `expo prebuild --clean` |
| Generic icon instead of banner | Banner path wrong, file missing, or wrong dimensions | Check path in `app.json`, verify 400×240 |
| "App not optimized for TV" warning | Missing `uses-feature` leanback | Plugin should add it; re-prebuild |
| Crash on launch on Fire TV only | Dep uses Play Services | Find a Fire-compatible alternative or stub the feature |
| Remote doesn't navigate | Touch-only components used | See spatial-navigation.md |

## Store submission notes (out of v1 scope, but flag)

- Amazon Appstore: requires the Fire TV banner, a 1280×720 promo screenshot, and content rating.
- Google Play TV: requires TV-quality screenshots, banner, and the `android.software.leanback` feature in the manifest.

The harness doesn't submit. It produces an APK that's *ready to submit*.

## Anti-patterns

- **Manually editing `AndroidManifest.xml`.** Use plugins. Manual edits are erased on prebuild.
- **Shipping without a banner.** Looks broken in the launcher; some stores reject.
- **Assuming Fire TV = Android TV everywhere.** Mostly true at runtime, not true at submission or for Play-Services-dependent deps.
- **Banner with text smaller than 24pt.** Unreadable on a 10-ft TV.
