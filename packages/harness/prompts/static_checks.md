Run all static checks and fix any errors.

STEP 0: Fix shared-ui/package.json (CRITICAL — prevents white screen / MIME type / ReactCurrentOwner crash).
Run: cat {{appDir}}/packages/shared-ui/package.json
Check the devDependencies field. It must ONLY contain entries starting with "@types/" and "typescript".
If ANY runtime package is in devDependencies (react-tv-space-navigation, @bam.tech/lrud, @react-navigation/*, react-native*, react, react-dom, react-native-gesture-handler, react-native-reanimated, react-native-screens, react-native-safe-area-context, react-native-video, expo-linear-gradient, react-native-pixel-perfect, etc.):
1. Remove it from devDependencies
2. Add it to peerDependencies (with "*" version)
3. Make sure expo-multi-tv/package.json has it in dependencies (add if missing)
4. CRITICAL: Delete shared-ui/node_modules entirely and re-install:
   Run: rm -rf {{appDir}}/packages/shared-ui/node_modules
   Run: cd "{{appDir}}" && yarn install
WHY: Packages in shared-ui/devDependencies get installed in shared-ui/node_modules/. Metro resolves imports from there but those packages can't find THEIR dependencies (react, react-native-worklets, etc.) because those only exist in expo-multi-tv/node_modules/. This causes Metro bundling to fail with "Unable to resolve module" or the app crashes with "ReactCurrentOwner" error. Deleting shared-ui/node_modules forces Metro to resolve everything from expo-multi-tv where all deps are available.

STEP 1: TypeScript check.
Run: cd "{{appDir}}" && npx tsc --noEmit 2>&1
If there are errors, fix them. Common issues:
- Missing imports for new screens or hooks
- Type mismatches in data hooks (content shape changed)
- Unused imports from removed template code

STEP 2: Lint (if available).
Run: cd "{{appDir}}" && npx eslint src/ --ext .ts,.tsx 2>&1 | tail -20
Fix auto-fixable issues: cd "{{appDir}}" && npx eslint src/ --ext .ts,.tsx --fix

STEP 3: Verify all screens are reachable.
Check that every screen exported from screens/index.ts is referenced in the navigation config.
grep -r "Screen" {{appDir}}/packages/shared-ui/src/navigation/ --include="*.tsx" --include="*.ts"

STEP 4: Check for duplicate remote control registration (CAUSES DOUBLE-STEP FOCUS BUG).
Run: grep -rn "configureRemoteControl\|import.*configureRemoteControl" {{appDir}}/ --include="*.tsx" --include="*.ts" | grep -v node_modules

The file "configureRemoteControl" calls SpatialNavigation.configureRemoteControl() which registers a keyboard event listener. If this file is imported MORE THAN ONCE (from different locations), the listener is registered multiple times and every keypress fires 2+ events → double-step focus.

There must be EXACTLY ONE import of configureRemoteControl in the entire app. It should be in the root App.tsx (the entry point) ONLY.

If you find multiple imports:
- Keep ONLY the one in apps/expo-multi-tv/App.tsx (the root entry)
- REMOVE any require() or import of configureRemoteControl from:
  - navigation/AppNavigator.tsx
  - apps/expo-multi-tv/app/configureRemoteControl.ts (delete this file if it just re-exports)
  - Any other location

After removing duplicates, verify:
Run: grep -rn "configureRemoteControl\|import.*configureRemoteControl" {{appDir}}/ --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l
This must return exactly 2 (the definition file + one import in App.tsx).

STEP 5: Remove React StrictMode (CAUSES DOUBLE-STEP FOCUS BUG on web).
Run: grep -rn "StrictMode\|<StrictMode" {{appDir}}/ --include="*.tsx" --include="*.ts" | grep -v node_modules

React 18+ StrictMode in development mode runs effects TWICE (mount → unmount → remount). This causes the spatial-navigation library's remoteControlSubscriber to register keyboard listeners TWICE — each keypress fires two events → double-step focus.

If you find <StrictMode> wrapping the app (usually in AppNavigator.tsx or App.tsx):
- REMOVE the <StrictMode> wrapper entirely
- Remove the StrictMode import

This is a known incompatibility between react-tv-space-navigation and StrictMode on web.

STEP 6: Verify drawer focus isolation on ALL screens.
When the drawer is open, screens behind it must NOT receive focus. Every screen with a SpatialNavigationRoot must disable it when the drawer is open.

Run: grep -rn "SpatialNavigationRoot" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx"
Run: grep -rn "isMenuOpen" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l

The isMenuOpen count must equal or exceed the SpatialNavigationRoot count. If any screen has SpatialNavigationRoot but does NOT use isMenuOpen to compute isActive, fix it:
- Add: import { useMenuContext } from '../components/MenuContext';
- Add: const { isOpen: isMenuOpen } = useMenuContext();
- Change: const isActive = isFocused && !isMenuOpen;
- The SpatialNavigationRoot must use isActive={isActive} with this computed value.

Without this fix, D-pad input will move focus on BOTH the drawer and the screen simultaneously.

STEP 7: Verify the detail screen is scrollable.
Run: grep -rn "ScrollView\|SpatialNavigationScrollView\|flex.*1" {{appDir}}/packages/shared-ui/src/screens/DetailsScreen.tsx | head -15

The detail screen must be wrapped in a ScrollView or SpatialNavigationScrollView so content below the fold is reachable. If the screen uses a plain View with flex:1 as its root, it will clip content that exceeds the viewport height.

If the detail screen has content that can extend below the viewport (hero image + metadata + related videos row):
- Ensure the root container is a SpatialNavigationScrollView (not just a View)
- Or ensure it uses a vertical SpatialNavigationNode that allows focus-driven scrolling
- The related videos row at the bottom MUST be reachable via D-pad down navigation

Report: how many errors found, how many fixed, any remaining.
