# TODOS

## Pre-implementation spikes (before day 1)

- [ ] **Vega SDK on M-series Mac** — Test whether the Vega SDK CLI (`kepler` commands) runs on Apple Silicon. If it doesn't, remove `firetv-vega` from `PlatformSchema` and drop phase 6 (Vega build) from V1_PHASES. Context: the design doc lists this as a load-bearing open question. Without a working SDK, the platform is dead weight in the type system.

- [ ] **Maestro D-pad on Android TV emulator** — Run `maestro test` with a YAML flow that sends D-pad events to an Android TV emulator. If it doesn't work, the fallback is `adb shell input keyevent` (DPAD_RIGHT=22, DPAD_DOWN=20, DPAD_CENTER=23). Context: Maestro is the preferred abstraction for D-pad replay but may not support TV emulator targets.

- [ ] **Expo TV prebuild wall-clock time** — Run `EXPO_TV=1 expo prebuild --platform android` and `EXPO_TV=1 expo prebuild --platform ios` on the AmazonAppDev template with warm cache. Measure time. If both exceed 10 minutes each, parallel execution is mandatory (not optional) for the 15-min target.

## Post-implementation (v2)

- [ ] **Self-improving skill library** — After 5+ tool calls on a novel sub-problem, auto-extract a new skill file to `./skills/auto/`. Requires: quality gate (500+ chars, anti-pattern section, code example), name uniqueness check, integration into index.

- [ ] **Screen customization phases** — Phases 5-8 from PRD: add/remove screens, drawer route updates, static analysis. Requires: shared-ui-catalog skill to drive reuse-first heuristic.

- [ ] **EAS Build + store submission** — Phases 12-13. Signed .ipa/.apk artifacts. Requires: EAS CLI auth, provisioning profiles, signing keys.

- [ ] **Screenshot comparison HTML report** — Generate a self-contained HTML page with side-by-side platform screenshots + AI commentary after each run. (Cherry-picked into v1 scope but could slip if time is tight.)
