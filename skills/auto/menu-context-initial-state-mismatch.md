---
name: menu-context-initial-state-mismatch
applies_to: [android_test_loop]
meta:
  created_by_run: e861001d
  created_at: 2026-07-15
  times_loaded: 0
  times_defect_recurred: 0
---

# MenuContext Initial State Must Match Drawer defaultStatus

## Problem

When generating a TV app with a drawer navigator and `react-tv-space-navigation`, the `MenuContext` (which tracks whether the drawer is open) is initialized with `useState(true)` while the drawer's `defaultStatus` is `"closed"`. This mismatch causes:

1. The HomeScreen's `SpatialNavigationRoot` has `isActive={isFocused && !isMenuOpen}` which evaluates to `false` on mount.
2. All D-pad key events reach the JS spatial navigation system via `react-native-keyevent` but are silently ignored because the `SpatialNavigationRoot` is inactive.
3. No focus indicator ever appears on any content card.
4. The drawer's `SpatialNavigationRoot` has `isActive={isMenuOpen}` which is `true`, but since the drawer is visually closed (`defaultStatus="closed"`), its focusable items aren't visible or reachable.

The result is a completely unresponsive D-pad interface despite key events flowing correctly through the native-to-JS bridge. This is especially hard to diagnose because there's no crash, no error, and the app renders fine — it just doesn't respond to navigation.

## Fix Pattern

```typescript
// BEFORE (broken) - MenuContext says drawer is open, but drawer is visually closed
export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(true); // BUG: mismatch with defaultStatus="closed"
  // ...
};

// AFTER (fixed) - initial state matches the drawer's defaultStatus
export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false); // matches defaultStatus="closed"
  // ...
};
```

## Diagnostic Sequence

1. App renders correctly (hero, rails, cards visible).
2. D-pad keys reach the Activity's `dispatchKeyEvent` (confirmed via logcat).
3. `KeyEventModule` emits events (no null-pointer warnings).
4. But NO visual focus change occurs on any card.
5. Check `MenuContext` initial state vs drawer `defaultStatus`.

## Gotchas

- This bug is invisible in development when using Metro dev server with hot reload, because the drawer state may have been toggled at least once during testing, resetting the mismatch.
- On tvOS/Apple TV, the same `MenuContext` mismatch exists but may not manifest because Apple TV uses a different focus engine (UIKit focus system) that doesn't depend on `SpatialNavigationRoot.isActive`.
- The `DrawerSyncWrapper` component's useEffect `if (isMenuOpen) { navigation.dispatch(DrawerActions.openDrawer()); }` would open the drawer on mount if `isMenuOpen=true`, potentially masking the issue on some runs where the drawer correctly opens.
