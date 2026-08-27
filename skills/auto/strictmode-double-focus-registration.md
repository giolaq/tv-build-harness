---
name: strictmode-double-focus-registration
applies_to: [verify]
meta:
  created_by_run: 6fe1f566
  created_at: 2026-07-17
  times_loaded: 0
  times_defect_recurred: 0
---

# React.StrictMode Double-Registers Spatial Navigation Remote Control

## Problem

Wrapping the app root in `<React.StrictMode>` breaks D-pad focus on
`react-tv-space-navigation` apps. In development, StrictMode intentionally
double-invokes component render and effect mount/unmount cycles to surface
impure code. For spatial navigation this means the `SpatialNavigationRoot`
subscribe → unsubscribe → subscribe lifecycle runs twice, and any remote-control
listener registered through `SpatialNavigation.configureRemoteControl` gets wired
up twice.

The visible symptom is **double-step D-pad navigation**: pressing right once moves
focus two tiles, or focus "jumps" and feels uncontrollable. It is dev-only and
silent in production builds, which makes it easy to ship a template that looks
fine in a release build but is unusable in the dev loop QA uses.

This compounds with the `addKeydownListener` return-type bug (see
[[remote-control-listener-return-type]]): if the unsubscribe is also broken, the
duplicate listener is never torn down at all.

## Fix Pattern

```typescript
// BEFORE (broken) — StrictMode double-mounts the navigation root
import React, { useEffect, StrictMode } from 'react';

export default function AppNavigator() {
  return (
    <StrictMode>
      <NavigationContainer theme={DarkTheme}>
        <MenuProvider>
          <RootNavigator />
        </MenuProvider>
      </NavigationContainer>
    </StrictMode>
  );
}

// AFTER (fixed) — no StrictMode around the spatial-navigation tree
import React, { useEffect } from 'react';

export default function AppNavigator() {
  return (
    // StrictMode intentionally omitted: it double-invokes the spatial-navigation
    // root subscribe/unsubscribe lifecycle and double-registers remote listeners,
    // causing double-step D-pad focus in dev.
    <NavigationContainer theme={DarkTheme}>
      <MenuProvider>
        <RootNavigator />
      </MenuProvider>
    </NavigationContainer>
  );
}
```

## Verification Command

```bash
grep -rnE "import.*StrictMode|<StrictMode" packages/shared-ui/src packages/*/src apps/*/src --include="*.tsx"
```

Any match around the navigation container / spatial-navigation tree is a defect.
A match inside a comment (documenting the omission) is fine.

## Gotchas

- Do NOT "fix" this by making the listener idempotent while keeping StrictMode.
  Other spatial-navigation internals (focus registration, virtualized list
  measurement) also double-run; remove StrictMode from the focus tree entirely.
- The bug only reproduces in dev / Metro. A production build masks it, so a
  typecheck-only or release-build check will not catch it — grep for the tag.
- If you genuinely want StrictMode for other subtrees, wrap only the
  non-navigation parts of the tree, never the `SpatialNavigationRoot` ancestors.
- Pairs with [[remote-control-listener-return-type]]: fix both together, since a
  broken unsubscribe turns the double-registration into an unbounded leak.
