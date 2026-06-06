---
name: spatial-navigation
applies_to: [phase_screens, phase_static_check]
load_when: writing new screens, fixing focus-check failures, debugging "remote doesn't work"
---

# Spatial navigation

> The template uses **React TV Space Navigation** for focus management, not raw `TVFocusGuide`. They are different paradigms. Mixing them causes hard-to-debug focus loss. Pick one boundary and stay in it.

## What React TV Space Navigation does

It builds a virtual focus tree from your component hierarchy. Each focusable element is a node. The library computes "nearest focusable in this direction" based on screen position, regardless of DOM order. This is more robust than `nextFocusUp` / `nextFocusDown` chains, which break the moment layout shifts.

Two key primitives:

- **`<SpatialNavigationRoot>`** — wraps a screen. Owns its focus tree. There is exactly one per screen.
- **`<SpatialNavigationNode>`** — a focusable element, or a focus group (grid, rail).
- **`<SpatialNavigationFocusableView>`** — leaf-level focusable (a tile, a button).

The template wraps these inside `<Tile>`, `<Grid>`, `<Rail>` so most of the time you don't see them directly. **You see them when you write a new screen.**

## Screen skeleton (the only correct shape)

```tsx
import { SpatialNavigationRoot } from "react-tv-space-navigation";

export function MyScreen() {
  return (
    <SpatialNavigationRoot>
      {/* Drawer is rendered by parent navigator; screen content here */}
      <Hero />
      <Rail title="Featured" items={...} />
      <Grid items={...} />
    </SpatialNavigationRoot>
  );
}
```

Without the `<SpatialNavigationRoot>`, **nothing inside is focusable.** This is the #1 source of "remote doesn't work on my new screen."

## Decision tree: what kind of node do I need?

**A single button/tile.** → `<SpatialNavigationFocusableView>` (or just use `<Tile>` / `<Pressable>` from the template's themed components, which already wrap it).

**A row of items, focus should move horizontally between them.** → `<Rail>`. Don't roll your own; it handles virtualization + focus restoration.

**A 2D grid.** → `<Grid>`. Same reason.

**A custom layout (e.g. carousel, tabs).** → `<SpatialNavigationNode orientation="horizontal">` (or vertical) wrapping focusable children.

**You want to override which element gets focus first on mount.** → Use the `defaultFocus` prop on the root, set to a node ref.

## Focus trapping — when and how

You want to trap focus inside:

- The drawer when open.
- A modal dialog.
- The video player controls during playback.

Use `<SpatialNavigationNode isFocusable={false} captureFocus>` to create a trap zone. Releases when the wrapper unmounts.

You do **not** want to trap focus inside:
- A regular rail or grid. Users expect to escape upward to the hero or leftward to the drawer.
- Static content sections.

## Dynamic content + focus restoration

When a list re-renders (new data, filter change), focus can vanish. The template's `<Grid>` and `<Rail>` handle this. If you're writing a custom list:

1. Give every focusable a stable key — usually `item.id`.
2. Use `useSpatialNavigationFocus()` to remember the last-focused index when the list updates.
3. On data change, restore focus to that index if still valid, else index 0.

Without this, every time the user filters or returns to a screen, focus snaps to a random place.

## Edge cases the focus-check linter catches

The `run_focus_check` tool catches these statically. When it fails, the cause is almost always one of:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Element X is not in a focus tree" | Missing `<SpatialNavigationRoot>` ancestor | Wrap the screen |
| "Element X is unreachable" | Surrounded by `pointer-events: none` or zero-size container | Inspect parent layout |
| "Multiple focus roots in one screen" | Nested `<SpatialNavigationRoot>` (don't do this) | Keep one root per screen; use Nodes inside |
| "Focusable inside `Touchable*`" | Wrapping focus in legacy touchable wrapper | Use `<Pressable>` or `<SpatialNavigationFocusableView>` |
| "Hidden focusable" | `display: none` element still in tree | Conditionally render with `{cond && <X />}` instead |

## Remote-control event handling

99% of cases: don't write a custom handler. The library translates D-pad to focus moves, `select` to `onPress`. That's enough.

When you need a custom handler:
- Back button on detail screen → use the React Navigation `goBack`. Don't intercept hardware back globally.
- Long-press select → `onLongPress` on the focusable. Built-in.
- Channel up/down on a player screen → use the `remote-control/` per-platform handlers; this is one of the few places you legitimately need platform splits.

## Platform-specific gotchas

**Apple TV:** the Siri Remote's trackpad emits a stream of pan events. The library debounces but custom screens may not. If you're hand-rolling a navigation pattern, test on Apple TV before declaring it works.

**Android TV / Fire TV:** the back button is hardware. React Navigation handles it. Custom back behavior must go through `BackHandler`, not raw event listeners.

**Vega OS:** spatial navigation works, but Vega's preferred pattern is its own Vega UI components. For shared-ui screens, the library works fine. For Vega-only screens (in `apps/vega/`), prefer Vega UI primitives.

**Web:** the library uses keyboard arrow keys. Mouse focus is disabled by default. If web is a target, verify arrow-key navigation in a browser before assuming parity.

## The #1 Generated-App Bug: Double-Step Focus

**Symptom:** Every direction key press moves focus 2 positions instead of 1.

**Cause:** Duplicate event processing. The spatial-navigation library already handles ALL D-pad/arrow-key events internally. If you ALSO add:
- `onKeyDown` handlers on components
- `document.addEventListener('keydown', ...)` anywhere
- `onFocus` handlers that call navigation/focus methods
- `useEffect` hooks that respond to focus changes by moving focus again

...then both the library AND your custom code process the same keypress, and focus moves twice.

**The rule:** react-tv-space-navigation is the SOLE owner of D-pad events. You NEVER need to:
- Listen for arrow keys yourself
- Manually move focus in response to key events
- Add `onFocus` callbacks that trigger navigation

**What you CAN add:**
- `onSelect` / `onPress` → fires on Enter/Select button (the library calls it)
- `onLongPress` → fires on long-press
- Visual styling via `isFocused` render prop
- `onBlur` for cleanup (but NOT for moving focus elsewhere)

**How to verify:** `grep -rn "onKeyDown\|addEventListener.*key\|onFocus.*navigate\|onFocus.*setFocus" src/` should return zero results in screen/component code. Only the `remote-control/` platform handlers should touch key events.

## Anti-patterns

- **Nesting `<SpatialNavigationRoot>`.** Only the outermost wins. Inner roots silently break their subtree.
- **`onFocus` side effects with state updates that re-render the focused node.** Causes focus to drop. Debounce or move the effect outside the focused subtree.
- **`useEffect` that grabs focus on mount without checking if another element is already focused.** Steals focus on every render.
- **Trying to use `tabIndex`.** That's web. The library uses its own focus model.
- **Custom `setFocus(ref)` calls in render.** Always do this in event handlers or effects, never inline.
- **Adding onKeyDown or keyboard event listeners for D-pad.** The library already handles this. Adding your own causes double-step focus movement.
