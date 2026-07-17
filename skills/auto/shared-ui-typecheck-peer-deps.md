---
name: shared-ui-typecheck-peer-deps
applies_to: [verify]
meta:
  created_by_run: 6fe1f566
  created_at: 2026-07-17
  times_loaded: 0
  times_defect_recurred: 0
---

# shared-ui Typecheck Fails With TS2307 "Cannot find module 'react-native'"

## Problem

In the multi-TV monorepo (`apps/expo-multi-tv`, `apps/vega`, `packages/shared-ui`),
running the app-level typecheck (`yarn workspace expo-multi-tv tsc --noEmit`, the
gate per rn-template-anatomy) fails with dozens of errors, ALL inside
`packages/shared-ui/src/*`:

```
error TS2307: Cannot find module 'react-native' or its corresponding type declarations.
error TS2307: Cannot find module 'react-tv-space-navigation' ...
error TS7031: Binding element 'isFocused' implicitly has an 'any' type.   ← downstream
error TS7006: Parameter 'error' implicitly has an 'any' type.              ← downstream
```

Root cause: `shared-ui/package.json` declares `react-native`, `react-tv-space-navigation`,
`@react-navigation/*`, `@bam.tech/lrud`, `react-native-video`, etc. as
**peerDependencies only**. The repo sets `nmHoistingLimits: workspaces` in
`.yarnrc.yml` because the two apps pin *conflicting* RN versions
(expo: `react-native-tvos@0.81`, vega: `react-native@0.72`) that cannot be hoisted
to a shared root. So `tsc`, walking into `shared-ui` source, has no `node_modules`
from which to resolve those modules. The `TS7031`/`TS7006` implicit-`any` errors are
NOT sloppy generated code — they are downstream: when `react-tv-space-navigation`
fails to resolve, `SpatialNavigationFocusableView`'s render-prop `{ isFocused }`
and `Image`'s `onError` param lose their types.

Key tell: the SAME errors hit untouched template files (`HomeScreen.tsx`,
`DetailsScreen.tsx`), and `App.tsx`'s own `import ... from 'react-native'` does NOT
error (it lives in the app workspace where the dep resolves). That proves it is a
workspace-visibility artifact, not a code defect. Do not "fix" the implicit-anys by
annotating params — that treats the symptom.

## Fix Pattern

Give `shared-ui` the type-providing packages as **devDependencies** (keep them as
peerDependencies too), matching the newer expo app's versions (that is the API the
shared code targets). This makes `tsc` resolve types without touching either app's
runtime copies.

**CRITICAL:** Do NOT add `react` or `react-native` to shared-ui's devDependencies.
With `nmHoistingLimits: workspaces` in `.yarnrc.yml`, any `react` entry in
shared-ui (even devDependencies) installs a physical copy at
`packages/shared-ui/node_modules/react/`. The web bundler then resolves this
copy instead of the app's React, causing "Invalid hook call — more than one copy
of React" and a white screen on web. Use only `@types/react` for typechecking.

```jsonc
// packages/shared-ui/package.json
"peerDependencies": {
  "@bam.tech/lrud": "*", "@react-navigation/drawer": "*",
  "@react-navigation/native": "*", "@react-navigation/native-stack": "*",
  "react": "*", "react-native": "*", "react-native-gesture-handler": "*",
  "react-native-video": "*", "react-tv-space-navigation": "*"
},
"devDependencies": {
  "@bam.tech/lrud": "8.0.2",
  "@react-navigation/drawer": "^7.0.0",
  "@react-navigation/native": "^7.0.0",
  "@react-navigation/native-stack": "^7.0.0",
  "react-native-gesture-handler": "^2.31.2",
  "react-native-video": "^6.8.0",
  "react-tv-space-navigation": "6.0.0-beta1",
  "@types/react": "~19.1.0", "typescript": "~5.7.0"
}
```

Then `yarn install` and re-run the app typecheck.

### The one dep NOT to add: packages with an ambient shim

`react-native-pixel-perfect` ships NO type declarations. shared-ui already carries a
`src/types/react-native-pixel-perfect.d.ts` ambient `declare module` shim. If you add
the real package as a devDependency, `tsc` resolves the import to the actual typeless
JS, which *shadows* the shim → `TS7016 "implicitly has an 'any' type"`. Remove it from
the dep list AND ensure the shim is loaded from the importing file (an ambient
`declare module` in a sibling file is not pulled in during the *app's* typecheck):

```typescript
// packages/shared-ui/src/hooks/useScale.ts
/// <reference path="../types/react-native-pixel-perfect.d.ts" />
import { create } from 'react-native-pixel-perfect';
```

A triple-slash reference forces the ambient shim into the program from ANY workspace
that compiles this file, with no package installed. Verified: with the shim referenced
and the package NOT installed, the import resolves and typecheck is green.

## Gotchas

- The gate is `yarn workspace expo-multi-tv tsc --noEmit`, NOT shared-ui's own
  `yarn typecheck`. shared-ui standalone will still show ~11 errors in platform-variant
  files (`*.vega.tsx`, `*.kepler.ts` importing `@amazon-devices/*`, `RemoteControlManager.android.ts`
  importing `react-native-keyevent`, and the web `RemoteControlManager.ts` needing DOM
  `window`/`KeyboardEvent`). Those are resolved per-platform by each app's build config and
  are NOT part of the typecheck gate. Do not chase them.
- `nmHoistingLimits: workspaces` is deliberate (conflicting RN versions). Do NOT remove it
  or add these as root deps to "fix hoisting" — that breaks the vega app.
- An ambient `declare module 'x'` shim resolves an import ONLY when the shim file is in
  the tsc program. It does that during the package's OWN typecheck (the shim is under
  `src/`) but NOT when an app pulls the source in via imports — hence the triple-slash ref.
- Adding a real installed package with typeless JS turns a `TS2307` (unresolved) into a
  `TS7016` (resolved-but-untyped). If you see TS7016, the fix is a shim/`@types`, not a dep.
