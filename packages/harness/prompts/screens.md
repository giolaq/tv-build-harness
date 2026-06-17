Customize screens to match the AppSpec. The principle is REUSE FIRST — only create new screens if the template doesn't have one that fits.

STEP 1: Discover what screens already exist in the template.
Run: find {{appDir}}/packages/shared-ui/src/screens -name "*.tsx" | head -20
Read the screen files to understand their layouts.

STEP 2: Match AppSpec screens to template screens.
AppSpec screens:
{{screensList}}

For each AppSpec screen:
- If "uses_template_screen" is set, verify that screen exists and only make minor customizations (props, data source).
- If the layout matches an existing template screen (hero+rails → HomeScreen, grid → GridScreen, detail → DetailScreen, player → PlayerScreen), reuse it.
- Only create a NEW screen file if no existing screen can serve the purpose.

⚠️ DEPENDENCY RULE: NEVER run "yarn add" in the shared-ui workspace. NEVER edit shared-ui/package.json devDependencies to add runtime packages.
If you need a new package, add it to expo-multi-tv ONLY: yarn workspace @multi-tv/expo-multi-tv add <package>
shared-ui's devDependencies must ONLY have @types/* and typescript. Anything else causes ReactCurrentOwner crashes at runtime.

STEP 3: Create any genuinely new screens.
For new screens, create them at {{appDir}}/packages/shared-ui/src/screens/<ScreenName>Screen.tsx.
Use existing components from {{appDir}}/packages/shared-ui/src/components/ — read what's available first.
All interactive elements must use the template's existing Pressable or Tile components (which already wrap SpatialNavigationFocusableView internally).

⚠️ DO NOT add custom onFocus, onKeyDown, or keyboard event listeners for D-pad navigation.
The react-tv-space-navigation library handles ALL arrow key → focus movement automatically.
Adding custom handlers causes DOUBLE-STEP focus (each keypress moves 2 positions instead of 1).

Only add:
- onPress / onSelect → for selection actions (the library calls these on Enter/Select)
- onLongPress → for long-press actions
- Visual styling via the isFocused render prop (already built into template's Tile/Card)

DO NOT add: onKeyDown, addEventListener('keydown'), manual focus management with useEffect, or any code that calls setFocus/moveFocus in response to arrow keys.

⚠️ DO NOT MODIFY RemoteControlManager.ts or RemoteControlManager.android.ts.
The `addKeydownListener` method MUST return the listener function itself (not a cleanup function).
The return type MUST be `(event: SupportedKeys) => void` — the SAME function that was passed in.
This is critical: `removeKeydownListener` uses the returned reference to unsubscribe. If you return
a wrapper/cleanup function instead, `removeKeydownListener` can never find the original listener
to remove it, causing listener accumulation and double/triple navigation on every key press.

{{#if hasDrawer}}
⚠️ DRAWER FOCUS ISOLATION — EVERY screen must deactivate its SpatialNavigationRoot when the drawer is open.
Without this, D-pad input moves focus on BOTH the drawer AND the screen behind it simultaneously.
Pattern — EVERY screen MUST follow this:
  import { useIsFocused } from '@react-navigation/native';
  import { useMenuContext } from '../components/MenuContext';
  ...
  const isFocused = useIsFocused();
  const { isOpen: isMenuOpen } = useMenuContext();
  const isActive = isFocused && !isMenuOpen;
  ...
  <SpatialNavigationRoot isActive={isActive}>

NEVER use just isActive={isFocused} — that leaves the screen active when the drawer is open.
{{/if}}
{{#if noDrawer}}
Every screen must use useIsFocused() to deactivate its SpatialNavigationRoot when not the active route:
  import { useIsFocused } from '@react-navigation/native';
  ...
  const isFocused = useIsFocused();
  ...
  <SpatialNavigationRoot isActive={isFocused}>
{{/if}}

⚠️ SCROLLING RULE for screens with content below the viewport:
If a screen has content that can extend below 1080px (e.g. detail screen with hero + metadata + related videos), it MUST use SpatialNavigationScrollView as its root scrollable container. A plain View with flex:1 will CLIP content — the user won't be able to scroll down with the remote.
Pattern:
  <SpatialNavigationRoot isActive={isActive}>
    <SpatialNavigationScrollView>
      {/* hero, metadata, related videos row, etc. */}
    </SpatialNavigationScrollView>
  </SpatialNavigationRoot>

⚠️ OVERFLOW RULE for any element with a focused scale transform:
If a card/tile has overflow:'hidden' (for image border-radius clipping), the focused style MUST add overflow:'visible' so the focus border and scale growth are not clipped by the element's own bounds. The parent container must also have overflow:'visible' and enough padding to accommodate the scale growth. Example:
  thumbnail: { overflow: 'hidden', borderRadius: 12 },
  thumbnailFocused: { overflow: 'visible', transform: [{ scale: 1.08 }], borderWidth: 6 }

⚠️ VIRTUALIZEDLIST OVERLAP RULE:
SpatialNavigationVirtualizedList itemSize MUST account for focused scale, not just base size.
Formula: itemSize = (cardWidth * scale) + gap + (borderWidth * 2)
Example: card 420px wide, scale 1.08, margin 20px, border 6px → itemSize = scaledPixels(486)
If you use itemSize = cardWidth + margin (ignoring scale), focused cards OVERLAP their neighbors.

⚠️ CONTAINER PADDING RULE for horizontal lists:
The container wrapping a horizontal VirtualizedList needs paddingTop AND paddingBottom:
  paddingTop = (cardHeight * (scale - 1) / 2) + borderWidth
  paddingBottom = same
Example: card 236px, scale 1.08, border 6px → padding = (236*0.08/2) + 6 = 16px minimum
Without this, the top/bottom of focused cards get clipped by the container.

STEP 4: Export all screens from the screens index.
Check {{appDir}}/packages/shared-ui/src/screens/index.ts (or similar barrel file) and add exports for any new screens.

STEP 5: Verify.
Run: cd "{{appDir}}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors.
