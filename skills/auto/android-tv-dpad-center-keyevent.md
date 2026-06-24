---
name: android-tv-dpad-center-keyevent
applies_to: [android_test_loop]
meta:
  created_by_run: 76d46105
  created_at: 2026-06-23
  times_loaded: 0
  times_defect_recurred: 0
---

# DPAD_CENTER Not Reaching react-native-keyevent on Android TV

## Problem

When using `react-native-keyevent` on Android TV, directional keys (UP/DOWN/LEFT/RIGHT) reach the JS layer via `KeyEvent.onKeyDownListener`, but DPAD_CENTER (keycode 23) and ENTER (keycode 66) are silently consumed by the Android native focus system before reaching the Activity's `onKeyDown` method.

This means `SpatialNavigationFocusableView.onSelect` never fires — focus moves correctly but selecting items does nothing.

**Root cause**: Android's View system consumes ACTION_DOWN for DPAD_CENTER on any natively-focusable view (it triggers `performClick()`). The Activity's `onKeyDown` is only called if no child view handles the event first. Directional keys are navigation events and pass through; DPAD_CENTER is a "click" event and gets eaten.

## Fix Pattern

Override `dispatchKeyEvent` instead of `onKeyDown`/`onKeyUp`. `dispatchKeyEvent` intercepts ALL key events at the Activity level BEFORE they're dispatched to child views.

```kotlin
// BEFORE (broken) — onKeyDown never sees DPAD_CENTER
override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
  KeyEventModule.getInstance().onKeyDownEvent(keyCode, event)
  super.onKeyDown(keyCode, event)
  return true
}

override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
  KeyEventModule.getInstance().onKeyUpEvent(keyCode, event)
  super.onKeyUp(keyCode, event)
  return true
}

// AFTER (fixed) — dispatchKeyEvent sees ALL events before child views
override fun dispatchKeyEvent(event: KeyEvent): Boolean {
  if (event.action == KeyEvent.ACTION_DOWN) {
    KeyEventModule.getInstance().onKeyDownEvent(event.keyCode, event)
  }
  if (event.action == KeyEvent.ACTION_UP) {
    KeyEventModule.getInstance().onKeyUpEvent(event.keyCode, event)
  }
  return super.dispatchKeyEvent(event)
}
```

## Diagnosis Steps

1. `adb logcat -c && adb shell input keyevent 20 && sleep 1 && adb logcat -d | grep "Key pressed"` — should show "Down"
2. `adb logcat -c && adb shell input keyevent 23 && sleep 1 && adb logcat -d | grep "Key pressed"` — if empty, this is the bug
3. If directional keys log but DPAD_CENTER doesn't → apply this fix

## Gotchas

- Do NOT remove `super.dispatchKeyEvent(event)` — that breaks all native view interaction
- The `onKeyMultiple` override can remain as `onKeyMultiple` since it's not affected by this issue
- This fix also covers keycode 66 (ENTER key on keyboards/remotes)
- The Expo prebuild config plugin for react-native-keyevent generates the BROKEN `onKeyDown` pattern — you must patch MainActivity after prebuild
- If the project uses a custom Expo config plugin to inject key event handling, update the plugin template too
