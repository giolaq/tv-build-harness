---
name: vega-navigation-context-dedup
applies_to: [vega_build_loop, vega_qa_loop]
meta:
  created_by_run: 7a680a29
  created_at: 2026-07-13
  times_loaded: 0
  times_defect_recurred: 0
---

# Vega Navigation Context Deduplication

## Problem

When shared-ui code imports `@react-navigation/native` (e.g. `useNavigation`, `DrawerActions`), and the Vega app uses `@amazon-devices/react-navigation__native`, Metro's `extraNodeModules` mapping should redirect the import. However, if shared-ui has its own `node_modules/@react-navigation/` installed (from its own package.json deps), Metro may resolve directly to that local copy BEFORE checking extraNodeModules, resulting in duplicate React contexts.

The symptom is a fatal crash on launch:
```
Error: Couldn't find a navigation object. Is your component inside NavigationContainer?
```

The NavigationContainer renders fine (from @amazon-devices version), but useNavigation in shared-ui resolves to the OTHER package's context — which has no provider above it.

## Fix Pattern

```javascript
// BEFORE (broken) — only blocks ../node_modules and ../../packages/shared-ui/node_modules
blockList: [
  new RegExp(path.resolve(__dirname, '..', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
  new RegExp(path.resolve(__dirname, '..', '..', 'packages', 'shared-ui', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
]

// AFTER (fixed) — blocks ALL possible resolution paths for @react-navigation
blockList: [
  // shared-ui's own node_modules
  new RegExp(path.resolve(__dirname, '..', '..', 'packages', 'shared-ui', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
  // expo-multi-tv's node_modules (sibling app)
  new RegExp(path.resolve(__dirname, '..', 'expo-multi-tv', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
  // parent apps/ node_modules
  new RegExp(path.resolve(__dirname, '..', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
  // workspace root node_modules
  new RegExp(path.resolve(__dirname, '..', '..', 'node_modules', '@react-navigation').replace(/[/\\]/g, '[/\\\\]')),
]
```

## Diagnostic

Count occurrences of the error string in the bundle:
```bash
grep -c "Couldn.t find a navigation object" apps/vega/dist/index.bundle
```
If > 1, duplicate navigation packages are bundled.

## Gotchas

- The blockList regex uses `[/\\\\]` for cross-platform path separators — both forward and back slashes match.
- `extraNodeModules` alone is NOT sufficient — Metro checks local `node_modules` resolution before applying extraNodeModules mappings for transitive deps.
- The `@amazon-devices/react-navigation__core` package (which creates the actual NavigationContext) is separate from `@react-navigation/core` — they create different React context objects even if the API is identical.
- After fixing metro.config.js, you MUST rebuild (`react-native build-kepler --build-type Release`). The old bundle in `dist/` still has the duplicate.
- This same pattern applies to `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, and `react-native-safe-area-context` — all have `@amazon-devices/` equivalents on Vega.
