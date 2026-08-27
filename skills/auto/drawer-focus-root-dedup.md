---
name: drawer-focus-root-dedup
applies_to: [vega_qa_loop]
meta:
  created_by_run: 18cb29d3
  created_at: 2026-07-13
  times_loaded: 0
  times_defect_recurred: 0
---

# Drawer Navigator: Don't Wrap in SpatialNavigationRoot When Content Has Its Own

## Problem

When generating a drawer navigator for TV apps using react-tv-space-navigation, the code generator creates a `SpatialNavigationRoot` around the entire `Drawer.Navigator`, AND the custom drawer content component also creates its own `SpatialNavigationRoot`. This produces nested active roots when the drawer is open.

While react-tv-space-navigation handles multiple roots via `isActive`, having a parent root that wraps both the drawer content (which has its own root) and the screen content (which has its own root) creates an unnecessary third layer. The outer root's `onDirectionHandledWithoutMovement` callback becomes unreachable because the inner roots consume all navigation events first.

Result: The drawer's "press right to close" handler may not fire, or focus gets stuck in the drawer content root without propagating to the navigator-level close logic.

## Fix Pattern

```typescript
// BEFORE (broken) - VegaDrawerNavigator wraps everything in a root
export default function VegaDrawerNavigator() {
  const { isOpen: isMenuOpen, toggleMenu } = useMenuContext();
  const onDirectionHandledWithoutMovement = useCallback((movement) => {
    if (movement === 'right') { closeDrawer(); toggleMenu(false); }
  }, []);

  return (
    <SpatialNavigationRoot isActive={isMenuOpen} onDirectionHandledWithoutMovement={onDirectionHandledWithoutMovement}>
      <Drawer.Navigator drawerContent={CustomDrawerContent}>
        {/* Screens that each have their own SpatialNavigationRoot */}
      </Drawer.Navigator>
    </SpatialNavigationRoot>
  );
}

// CustomDrawerContent ALSO has:
// <SpatialNavigationRoot isActive={isMenuOpen}> ... </SpatialNavigationRoot>

// AFTER (fixed) - Remove the navigator-level root; drawer content owns focus
export default function VegaDrawerNavigator() {
  return (
    <Drawer.Navigator drawerContent={CustomDrawerContent}>
      {/* Screens manage their own roots via isActive={isFocused && !isMenuOpen} */}
    </Drawer.Navigator>
  );
}

// CustomDrawerContent keeps its SpatialNavigationRoot with the close-on-right logic
```

The correct architecture for drawer + react-tv-space-navigation:
- **Drawer content component** owns a `SpatialNavigationRoot isActive={isMenuOpen}` with the right-to-close handler
- **Each screen** owns a `SpatialNavigationRoot isActive={isFocused && !isMenuOpen}`
- **The navigator itself** does NOT have a root — it's just routing, not focus management

## Gotchas

- Don't confuse this with the "one root per screen" rule. Multiple roots with `isActive` is the CORRECT pattern for drawer apps — the issue is the THIRD redundant root at the navigator level.
- If the drawer content does NOT have its own root, then the navigator-level root IS needed. Check the drawer content first.
- The `onDirectionHandledWithoutMovement` for closing the drawer should live on the drawer content's root, not on a parent root that wraps both content and screens.
