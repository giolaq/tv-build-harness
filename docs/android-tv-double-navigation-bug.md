# Android TV Double Navigation Bug

## Problem

On Android TV, every D-pad press moves focus 2-3 positions instead of 1. The drawer and screen content both respond to the same key event simultaneously, causing navigation to jump multiple items.

This bug does NOT occur on web — only on Android with `react-native-tvos` + `react-tv-space-navigation` + `react-native-keyevent`.

## Root Causes

### Cause 1: `super.onKeyDown()` in MainActivity

The `react-native-keyevent` expo config plugin generates this in `MainActivity.kt`:

```kotlin
override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
  KeyEventModule.getInstance().onKeyDownEvent(keyCode, event)
  super.onKeyDown(keyCode, event)  // ← PROBLEM
  return true
}
```

`KeyEventModule.onKeyDownEvent()` sends the event to JavaScript (→ spatial-nav library).
`super.onKeyDown()` ALSO dispatches to React Native's native TV focus system.

Result: every D-pad press is processed TWICE — once by spatial-nav (virtual focus), once by native focus.

### Cause 2: `SpatialNavigationRoot isActive={false}` doesn't work on Android

On web, setting `isActive={false}` on a `SpatialNavigationRoot` stops it from processing events. On Android, it does NOT. Both the drawer root and the screen root process every key event regardless of `isActive`.

This means when the drawer is open:
- Drawer root processes the event → moves drawer focus
- Screen root ALSO processes the event → moves screen focus / scrolls

### Cause 3: Keycode 66 (ENTER) + Keycode 23 (DPAD_CENTER)

Some Android TV remotes send BOTH keycodes for a single physical button press. Without deduplication, `onSelect` fires twice.

### Cause 4: `GoBackConfiguration` re-subscribing

`GoBackConfiguration` uses `useEffect` with `[handleBackPress]` as a dependency. Since `handleBackPress` depends on `[navigation, isMenuOpen]`, it re-creates on every drawer open/close → effect re-runs → new listener registered before old cleanup completes.

## Fixes

### Fix 1: Skip `super.onKeyDown()` for D-pad keys

In `android/app/src/main/.../MainActivity.kt`:

```kotlin
override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
  KeyEventModule.getInstance().onKeyDownEvent(keyCode, event)
  val dpadKeys = setOf(
    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER
  )
  return if (keyCode in dpadKeys) true else super.onKeyDown(keyCode, event)
}
```

This prevents the native TV focus system from also processing D-pad events.

### Fix 2: Unmount screen's SpatialNavigationRoot when drawer is open

Since `isActive={false}` doesn't work on Android, conditionally unmount the root:

```tsx
// In each screen component:
const isActive = isFocused && !isMenuOpen;

if (!isActive) {
  // Render content without SpatialNavigationRoot
  return <View style={styles.container}>{renderHeader()}</View>;
}

return (
  <SpatialNavigationRoot isActive={isActive} ...>
    {/* full screen content with spatial nav */}
  </SpatialNavigationRoot>
);
```

### Fix 3: Debounce in RemoteControlManager.android.ts

```typescript
const DEBOUNCE_MS = 150;

class RemoteControlManager {
  private lastEmitTime = 0;
  private lastEmitKey: SupportedKeys | null = null;

  private handleKeyDown = (keyEvent: { keyCode: number }): void => {
    const mappedKey = KEY_CODE_MAPPING[keyEvent.keyCode];
    if (!mappedKey) return;

    const now = Date.now();
    if (mappedKey === this.lastEmitKey && now - this.lastEmitTime < DEBOUNCE_MS) {
      return; // duplicate within debounce window
    }

    this.lastEmitKey = mappedKey;
    this.lastEmitTime = now;
    this.eventEmitter.emit('keyDown', mappedKey);
  };
}
```

### Fix 4: GoBackConfiguration subscribe once

```tsx
export const GoBackConfiguration: React.FC = () => {
  const navigation = useNavigation();
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  useEffect(() => {
    const listener = (pressedKey: SupportedKeys) => {
      if (pressedKey === SupportedKeys.Back) {
        if (navigationRef.current.canGoBack()) {
          navigationRef.current.goBack();
        }
      }
    };

    RemoteControlManager.addKeydownListener(listener);
    return () => RemoteControlManager.removeKeydownListener(listener);
  }, []); // empty deps — subscribe ONCE

  return null;
};
```

### Fix 5: Add keycode 4 (KEYCODE_BACK) to mapping

The original template maps keycode 67 (KEYCODE_DEL/backspace) to Back. On Android TV, the remote's Back button is keycode 4 (KEYCODE_BACK):

```typescript
const KEY_CODE_MAPPING = {
  // ...
  4: SupportedKeys.Back,    // Android TV remote Back button
  67: SupportedKeys.Back,   // Keyboard backspace (web compat)
};
```

## Recommended Long-Term Solution

File an issue with `react-tv-space-navigation` requesting that `isActive={false}` fully disables event processing on Android (as it does on web). The library's `remoteControlSubscriber` callback dispatches to ALL roots — it should skip roots where `isActive={false}`.

Until that's fixed, the "unmount root when inactive" workaround is the most reliable approach.

## Platform Differences (Why Web Works)

| Behavior | Web | Android |
|----------|-----|---------|
| Key dispatch | Single `keydown` event | `onKeyDown` + native focus dispatch |
| `isActive={false}` | Properly disables root | Root still processes events |
| Back button | Browser Backspace (single handler) | System Back + RN BackHandler + KeyEvent |
| Screen transitions | Instant (no overlap) | Animated (both screens mounted ~300ms) |
| Remote keycodes | One code per press | May send 23 + 66 for one press |
