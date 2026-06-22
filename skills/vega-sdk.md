---
name: vega-sdk
description: "Fire TV Vega OS (Kepler) build system: npx kepler build, Vega app structure, platform-specific components"
applies_to: [phase_vega_build]
load_when: target platforms include `firetv-vega`, or touching `apps/vega/`
---

# Vega SDK

> Vega OS is Amazon's new TV operating system (Fire TV's next-gen runtime, distinct from Fire OS which is Android-based). It uses the Kepler runtime and its own SDK. The template's `apps/vega/` is a separate app that shares UI via `packages/shared-ui` but builds on a different toolchain.

## What Vega is (and isn't)

- **Fire OS (legacy):** Android-based. Apps built like Android TV apps. Uses `apps/expo-multi-tv/`.
- **Vega OS (newer):** Not Android. Custom runtime called Kepler. JavaScript-based. Uses `apps/vega/`.

Both are "Fire TV" in the marketing. The difference is real. **A Fire OS APK does not run on Vega.** A Vega bundle does not run on Fire OS.

If the AppSpec targets Fire TV in general, target **both** by default. Drop one only if the user explicitly excludes it.

## `apps/vega/` layout

```
apps/vega/
├── src/
│   ├── App.tsx              # Vega entry
│   ├── screens/             # Vega-specific screens (if any)
│   └── ...
├── package.json             # Has @amazon-devices/* deps
├── vega.config.js           # Vega bundler config
└── assets/                  # Vega-specific assets
```

It imports from `@multi-tv/shared-ui` like the Expo app does. The Metro `.kepler.ts` resolver picks Vega-specific files automatically.

## Key `@amazon-devices/*` packages

These are the Vega-specific ones the agent will encounter:

- `@amazon-devices/kepler-app` — runtime, lifecycle, system events
- `@amazon-devices/kepler-ui-components` — native Vega UI primitives (use these for Vega-only screens for best perf)
- `@amazon-devices/kepler-media` — media playback APIs (use instead of `react-native-video` on Vega)
- `@amazon-devices/kepler-pointer` — input events, including remote
- `@amazon-devices/kepler-navigation` — system back, exit handling

The shared UI catalog's `<Player>` has a `.kepler.ts` override that swaps in `@amazon-devices/kepler-media`. **Don't bypass it.**

## What ports cleanly from Expo app → Vega

- React + JSX. Same.
- React Navigation. Works.
- React TV Space Navigation. Works.
- Styling via the theme system. Works.
- `packages/shared-ui` components. Mostly works; `.kepler.ts` overrides exist where they don't.

## What does NOT port

- `react-native-video` → use `@amazon-devices/kepler-media`.
- `expo-font` → fonts are loaded via Vega manifest, not at runtime.
- `expo-image` → use Vega's image primitive or plain `<Image>`.
- Any package that depends on Android Native Modules or iOS Native Modules. These will install but fail at runtime. Audit `package.json` deps before adding.
- Background tasks / push notifications differ — out of scope for v1.

If you add a new dependency to `packages/shared-ui` (which both apps consume), check it works on Vega. The safe rule: **pure-JS packages port; native-bridged packages probably don't.**

## Build commands

```bash
# From repo root
yarn workspace vega install

# Dev build (deploys to connected Vega device or sim)
yarn workspace vega dev

# Production bundle
yarn workspace vega build

# Bundle artifact ends up in apps/vega/dist/
```

The `vega_build` tool wraps these. The agent should not invoke Vega builds in parallel with Expo builds — both compete for emulator/device handles and the failure modes are confusing.

## Vega manifest essentials

`apps/vega/vega.json` (or equivalent — check current template) declares:
- App ID and version (mirror the Expo app's bundle ID for store consistency)
- Required capabilities (media playback, network)
- Entry point
- Icon and banner assets (Vega has its own size requirements — typically the same 400×240 banner works)

When `customize_app_metadata` runs, it must update **both** `apps/expo-multi-tv/app.json` and `apps/vega/vega.json`. Keeping them in sync is the agent's responsibility.

## Common Vega failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Module not found: @amazon-devices/*" on a non-Vega build | Imported a Kepler module without `.kepler.ts` extension | Move the import to a `.kepler.ts` file; provide a stub for the other platforms |
| Player shows black screen on Vega only | Using `react-native-video` directly | Use the `<Player>` from shared-ui, which has the override |
| App launches but remote doesn't navigate | Missing `<SpatialNavigationRoot>` on the Vega entry screen | Wrap as usual |
| Build succeeds but app rejected by Vega validator | Missing capability declaration in `vega.json` | Add the capability |
| Fonts don't render | Custom font not declared in Vega manifest | Declare in `vega.json` `fonts` array |

## Decision: should I add a Vega-specific override file?

Add `.kepler.ts` only if:
1. The default file imports a non-portable package.
2. The behavior must differ on Vega (UI guideline, system integration).

Don't add it for:
- Cosmetic tweaks. Use theme tokens with `.kepler.ts` overrides instead.
- "Just in case." Each override doubles maintenance.

## Testing notes

- A Vega emulator exists; the template's README has setup steps. **Don't ship to a real device on first run** — emulator catches the common issues faster.
- Vega's logcat equivalent is its own log stream; check the template's README or Amazon's Vega docs for the current command. Expect it to evolve.

## Anti-patterns

- **Forking `packages/shared-ui` for Vega.** Defeats the monorepo. Use `.kepler.ts` overrides on specific files.
- **Conditional logic `if (Platform.OS === 'kepler')` in shared files.** Use platform extensions; the bundler is the routing layer.
- **Skipping Vega in v1 "to ship faster".** If the user wanted Fire TV reach, half is not the answer. Either include Vega or drop Fire TV entirely.
- **Treating `apps/vega/` like a copy of `apps/expo-multi-tv/`.** It's a different runtime. Its entry, lifecycle, and APIs differ.
