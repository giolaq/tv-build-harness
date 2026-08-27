---
name: flex-in-scrollview-collapse
applies_to: [android_test_loop]
meta:
  created_by_run: e861001d
  created_at: 2026-07-15
  times_loaded: 0
  times_defect_recurred: 0
---

# flex: 1 Inside ScrollView Collapses to Zero Height

## Problem

When a `View` inside a `ScrollView` (or `SpatialNavigationScrollView`) has
`flex: 1`, it collapses to zero height on Android (and sometimes iOS). This
happens because `ScrollView` has unbounded height in its scroll direction — the
child cannot "flex" into an infinite container.

The symptom is invisible content: text, badges, and other non-focusable elements
disappear entirely while focusable buttons (which have intrinsic size from
padding and text) still render. This makes the defect look like missing data
or a broken component rather than a layout issue.

## Fix Pattern

```typescript
// BEFORE (broken) — flex: 1 has no meaning inside a scroll view
topContent: {
  flex: 1,
  justifyContent: 'center',
},

// AFTER (fixed) — remove flex, let content size itself
topContent: {
  justifyContent: 'flex-start',
  paddingTop: scaledPixels(20),
},
```

Remove `flex: 1` from any View that is a direct or near-direct child of a
ScrollView. Replace vertical centering (`justifyContent: 'center'`) with
explicit padding, since centering also requires a bounded container.

## Detection During QA

1. Layout dump shows very few nodes (only focusable buttons appear).
2. Screenshot shows large empty areas where text/metadata should render.
3. The content IS in the source and IS receiving data (params are passed
   correctly), yet nothing appears visually.

If the layout tree has fewer than expected nodes and the screen shows empty
space, check every ancestor View between the missing content and the nearest
ScrollView for `flex: 1`.

## Gotchas

- `flex: 1` is correct OUTSIDE ScrollView (e.g., the top-level container that
  wraps everything). Only the children of the scroll view itself are affected.
- On web (React Native Web), ScrollView sometimes behaves differently and the
  content may render fine, making this an Android/iOS-only bug that passes web
  visual QA but fails on device.
- `SpatialNavigationScrollView` from `react-tv-space-navigation` wraps
  ScrollView and has the same constraint.
- FlatList and SectionList share this behavior since they are ScrollView-based.
