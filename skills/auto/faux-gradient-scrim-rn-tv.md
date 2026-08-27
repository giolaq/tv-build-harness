---
name: faux-gradient-scrim-rn-tv
applies_to: [creative_ui]
meta:
  created_by_run: de72a84f
  created_at: 2026-07-16
  times_loaded: 0
  times_defect_recurred: 0
---

# Faux-Gradient Scrim Without expo-linear-gradient

## Problem

The template's `PlatformLinearGradient` component is a stub: it renders a
plain `View` filled with the **last color** of the gradient array (a solid
fill), because `expo-linear-gradient` was removed for cross-platform (Vega)
compatibility. Any "cinematic scrim" built on it becomes an opaque rectangle
that completely covers the hero image instead of fading over it. The screen
looks fine in code review — the gradient colors are all there in the props —
but on-device the featured artwork is invisible behind a solid block.

## Fix Pattern

Build the gradient as a stack of N sibling slices, each a solid `View` at a
stepped opacity of the target color. 8–10 steps reads as a smooth ramp at
10-foot distance. Works on every RN target (Android TV, tvOS, Vega, web)
with zero dependencies.

```tsx
// BEFORE (broken — collapses to a solid fill of the last color)
<PlatformLinearGradient
  colors={['transparent', 'rgba(15,10,6,0.6)', 'rgba(15,10,6,0.95)']}
  style={styles.scrim}
/>

// AFTER (fixed — a true opacity ramp built from stacked slices)
const STEPS = [0.02, 0.08, 0.18, 0.32, 0.5, 0.68, 0.84, 0.94, 0.99];
const backgroundRgb = '15, 10, 6'; // rgb triple of the app background color

const CinematicScrim = ({ direction = 'bottom', style }) => (
  <View
    pointerEvents="none"
    style={[
      { position: 'absolute', overflow: 'hidden' },
      direction === 'left'
        ? { flexDirection: 'row-reverse' }
        : { flexDirection: 'column' },
      style,
    ]}
  >
    {STEPS.map((opacity, i) => (
      <View key={i} style={{ flex: 1, backgroundColor: `rgba(${backgroundRgb}, ${opacity})` }} />
    ))}
  </View>
);
```

Position it absolutely over the image (e.g. `bottom: 0, height: '45%'` for a
bottom fade). Use the **app background color's** rgb triple, not pure black —
the scrim must melt the image into the page, and on themed apps the page is
not `#000`.

## Better: fix the component centrally, not per-caller

Rather than building a slice stack at every call site, fix `PlatformLinearGradient`
itself so its existing `colors`/`start`/`end` API renders a real ramp. Then every
existing caller (hero left-scrim, tile bottom-scrim, atmosphere) gets true
gradients with no edits. Interpolate multi-stop colors across N bands:

- Parse each stop (`#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`/`transparent`) to RGBA.
- For band `i/(N-1)`, find the surrounding stops from `locations` (or even spacing)
  and lerp r,g,b,a — emit `rgba(...)`. This handles `['rgba(..)','transparent']`
  fades AND multi-stop ramps, unlike a fixed single-color opacity table.
- Lay bands out with `flexDirection: 'row'` when the axis is horizontal
  (`|end.x-start.x| >= |end.y-start.y|`), else `'column'`. ~24–32 bands is smooth.
- Keep the API backward compatible (same props) so it is a drop-in.

This turns a documented per-scrim workaround into a one-file fix, and a 45° diagonal
atmosphere is then just an oversized vertical-gradient layer with `rotate: '-45deg'`.

## Anti-Pattern / Do Not

- **Do not** pass a gradient array to `PlatformLinearGradient` and assume it
  renders a ramp. Read the component first — in this template it is a solid
  fill fallback. Text will pass the contrast check (the solid fill is dark
  enough) while the imagery underneath is destroyed, so no verify step
  catches it.
- **Do not** add `expo-linear-gradient` (or any gradient package) to
  `packages/shared-ui` to fix this — shared-ui must stay dependency-free so
  the Vega app can consume it; native gradient modules do not exist on
  Kepler.
- **Do not** use a single semi-transparent overlay across the whole image as
  a shortcut. It dims the artwork uniformly instead of fading it, which
  reads as "washed out" rather than "cinematic".

## Gotchas

- Set `pointerEvents="none"` — the scrim sits between the image and
  focusable content and must never intercept focus/touch.
- For a side scrim in RTL-aware apps, use `flexDirection: 'row-reverse'` +
  `start`/`end` offsets rather than `left`-anchored slices, so the ramp
  protects the text side in both directions.
- Keep slice count ≤ ~10; each slice is a real View, and these scrims render
  inside every hero re-render (the Home hero re-renders on each focus
  change).
