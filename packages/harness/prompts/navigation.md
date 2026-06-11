Update the app navigation to match the AppSpec.

Navigation type requested: {{resolvedType}}
Routes:
{{routesList}}

⚠️ CRITICAL: SPATIAL NAVIGATION MUST BE PRESERVED ⚠️

This template uses "react-tv-space-navigation" for D-pad/remote control focus management.
It does NOT use browser tabIndex or native TVFocusGuide — it has its own virtual focus tree.
If you break the spatial navigation setup, the app will render but the remote/keyboard will NOT work.

Rules you MUST follow:
1. DO NOT remove or interfere with <SpatialNavigationRoot> in any screen component
2. DO NOT remove the spatial navigation provider/configuration from the app root (check App.tsx or the root navigator for SpatialNavigationDeviceTypeProvider or similar setup)
3. DO NOT use tabIndex for focusable elements — use the template's existing Tile/Pressable components which wrap SpatialNavigationFocusableView
4. DO NOT nest multiple <SpatialNavigationRoot> — exactly one per screen
5. The navigation container itself must remain keyboard-accessible — tab bars/drawers need their items to be SpatialNavigationFocusableView nodes so the remote can reach them
6. KEEP the remote-control/ directory and its platform handlers UNTOUCHED

STEP 1: Understand the current spatial navigation setup.
Run: grep -rn "SpatialNavigation\|react-tv-space-navigation\|SpatialNavigationRoot\|SpatialNavigationNode" {{appDir}}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -20
Run: grep -rn "SpatialNavigation" {{appDir}}/apps/expo-multi-tv/App.tsx 2>/dev/null || grep -rn "SpatialNavigation" {{appDir}}/apps/expo-multi-tv/src/ --include="*.tsx" 2>/dev/null | head -10
Run: cat {{appDir}}/packages/shared-ui/src/remote-control/ 2>/dev/null && ls {{appDir}}/packages/shared-ui/src/remote-control/ 2>/dev/null

Note what you find. You must preserve ALL of this.

STEP 2: Find the current navigation files.
Run: find {{appDir}}/packages/shared-ui/src -name "*.tsx" -o -name "*.ts" | grep -i -E "(nav|drawer|route|stack|tab)" | head -15
Read the main navigator files to understand the current structure.

STEP 3: Apply the navigation type.
{{typeInstructions}}

STEP 4: Make the new navigation focusable with spatial navigation.
After changing the navigator type, you MUST ensure the navigation UI itself works with the remote:

For TABS:
- Each tab item must be focusable. Wrap the tab bar in a SpatialNavigationNode with orientation="horizontal".
- Use a custom tabBar component that renders each tab as a SpatialNavigationFocusableView.
- When a tab is focused, highlight it visually. When pressed (Enter/Select), switch to that tab.
- Example pattern:
  tabBar: (props) => (
    <SpatialNavigationNode orientation="horizontal">
      {props.state.routes.map((route, i) => (
        <SpatialNavigationFocusableView key={route.key} onSelect={() => props.navigation.navigate(route.name)}>
          {({isFocused}) => (
            <Text style={[styles.tab, isFocused && styles.tabFocused]}>{route.name}</Text>
          )}
        </SpatialNavigationFocusableView>
      ))}
    </SpatialNavigationNode>
  )

⚠️ DO NOT add onKeyDown, addEventListener('keydown'), or any manual arrow-key handling anywhere.
The spatial-navigation library is the SOLE owner of D-pad/arrow-key events.
If you add a parallel listener, every keypress will move focus TWICE (double-step bug).
The SpatialNavigationFocusableView's onSelect prop is the ONLY handler you need — it fires on Enter/Select.

For DRAWER:
- The drawer content items must be SpatialNavigationFocusableView nodes.
- The drawer itself should be wrapped in SpatialNavigationNode with captureFocus when open.
- Menu item text fontSize must NOT exceed scaledPixels(28) — larger font + padding + scale(1.05) will overflow the drawer width (typically 300px).
- Menu items must have numberOfLines={1} to prevent text wrapping.
- The drawer container and DrawerContentScrollView must have overflow:'visible' for scale effects.

For HIDDEN:
- No navigation UI to worry about. Just ensure each screen still has its SpatialNavigationRoot.

STEP 5: Wire the routes.
Each route must point to an EXISTING screen component. First check what screens exist:
Run: ls {{appDir}}/packages/shared-ui/src/screens/
Only import screens that exist in that directory. Do NOT import non-existent screens.

Route → Screen mapping (use the closest match):
{{routesList}}

STEP 6: Verify navigation + focus integration.
Run: cd "{{appDir}}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors.

Then verify spatial navigation is intact:
Run: grep -rn "SpatialNavigationRoot" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l
This count must be ≥ the number of screens. If any screen is missing its SpatialNavigationRoot, add it.

Run: grep -rn "SpatialNavigationFocusableView\|SpatialNavigationNode" {{appDir}}/packages/shared-ui/src/navigation/ --include="*.tsx"
If the navigation UI has zero spatial navigation nodes, the remote CANNOT reach it. Fix this.

STEP 7: CRITICAL — Drawer focus isolation.
When the drawer is open, EVERY screen's SpatialNavigationRoot MUST be deactivated. Otherwise focus events leak to the screen behind the drawer and both the drawer and the screen respond to D-pad input simultaneously.

The pattern is:
  const isFocused = useIsFocused();
  const { isOpen: isMenuOpen } = useMenuContext();
  const isActive = isFocused && !isMenuOpen;
  ...
  <SpatialNavigationRoot isActive={isActive}>

Check EVERY screen:
Run: grep -rn "SpatialNavigationRoot" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx"

For EVERY screen that has <SpatialNavigationRoot isActive={...}>:
- If it uses isActive={isFocused} without checking isMenuOpen → FIX IT
- It MUST import useMenuContext and compute: const isActive = isFocused && !isMenuOpen;
- If the screen doesn't have useIsFocused, add it: import { useIsFocused } from '@react-navigation/native';
- If the screen doesn't import useMenuContext, add it: import { useMenuContext } from '../components/MenuContext';

Run: grep -rn "isMenuOpen" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l
Run: grep -rn "SpatialNavigationRoot" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l
These two counts MUST match. If isMenuOpen count is less, some screens are missing the drawer focus guard.

STEP 8: Verify keyboard/back navigation.
Check that React Navigation's back handling is still wired:
Run: grep -rn "BackHandler\|goBack\|headerBackVisible\|backBehavior" {{appDir}}/packages/shared-ui/src/ --include="*.tsx" --include="*.ts" | head -10
For web, React Navigation handles Backspace by default if the navigation container is properly set up. Ensure you haven't removed the NavigationContainer wrapper.
