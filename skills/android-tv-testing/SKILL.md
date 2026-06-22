---
name: android-tv-testing
description: "D-pad navigation testing methodology for Android TV emulators using adb and agent-device"
applies_to: [android_test_loop]
---

# Android TV Testing with agent-device

## agent-device Workflow Pattern

The canonical loop for testing an Android TV app:

```bash
# 1. Open the app
agent-device open com.tvharness.myapp --platform android

# 2. Inspect what's on screen
agent-device snapshot -i
# Output:
# @e1 [image] "Hero Banner"
# @e2 [button] "Live Now"  ← focused
# @e3 [button] "Sports"
# @e4 [button] "Schedule"

# 3. Interact with D-pad
agent-device key dpad_right    # move focus
agent-device key dpad_down     # move focus down
agent-device key dpad_center   # select/press
agent-device key back          # go back
agent-device key dpad_left     # open drawer (from leftmost position)

# 4. Verify state changed
agent-device snapshot -i
# New refs — screen changed

# 5. Capture evidence
agent-device screenshot ./path/to/save.png

# 6. Close when done
agent-device close
```

## Key Commands for TV Testing

| Action | Command | Notes |
|--------|---------|-------|
| Open app | `agent-device open <bundleId> --platform android` | Starts or brings to foreground |
| Get UI state | `agent-device snapshot -i` | `-i` = interactive elements only |
| D-pad Right | `agent-device key dpad_right` | Move focus right |
| D-pad Left | `agent-device key dpad_left` | Move focus left / open drawer |
| D-pad Up | `agent-device key dpad_up` | Move focus up |
| D-pad Down | `agent-device key dpad_down` | Move focus down |
| Select/Enter | `agent-device key dpad_center` | Press the focused element |
| Back | `agent-device key back` | Navigate back |
| Home | `agent-device key home` | Go to launcher |
| Screenshot | `agent-device screenshot <path>` | Saves PNG |
| Close session | `agent-device close` | Ends automation session |

## TV-Specific Testing Patterns

### Focus Verification
After each D-pad press, take a snapshot and verify the focused element changed:
```bash
agent-device key dpad_right
sleep 0.5
agent-device snapshot -i | grep "focused"
```
If the same element stays focused after multiple presses → navigation is broken.

### Screen Identity Verification
When navigating to a new screen:
1. Take snapshot BEFORE navigation
2. Press dpad_center or navigate
3. Take snapshot AFTER
4. Compare: refs should be completely different (different elements = different screen)
5. If refs are the same → navigation didn't work

### Drawer Testing Pattern
```bash
# From home screen, go to leftmost element
agent-device key dpad_left
agent-device key dpad_left
agent-device key dpad_left
# One more left should open drawer
agent-device key dpad_left
sleep 1
agent-device snapshot -i  # Should show drawer items
```

### Scroll Verification
Press down multiple times and verify new content appears:
```bash
for i in 1 2 3 4 5; do
  agent-device key dpad_down
  sleep 0.5
done
agent-device snapshot -i
# Should show elements not visible in initial snapshot
```

## Common Failures and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Focus doesn't move | SpatialNavigation not configured | Check configureRemoteControl import |
| All screens look the same | Drawer items not wired to routes | Fix navigation routing |
| App crashes on launch | Missing dependency or React duplicate | Check shared-ui devDependencies |
| Black screen | Metro bundler not started for dev build | Use release build or start metro |
| "No session" error | App closed/crashed | Re-run `agent-device open` |
| Snapshot empty | App not rendered yet | Wait longer (sleep 5) after open |

## Android TV AVD Setup

If no Android TV AVD exists:
```bash
# Install system image
sdkmanager "system-images;android-34;android-tv;x86_64"

# Create AVD
avdmanager create avd -n TV_API_34 \
  -k "system-images;android-34;android-tv;x86_64" \
  -d tv_1080p

# Verify
emulator -list-avds  # Should show TV_API_34
```

## Build Commands

```bash
# Prebuild (generates android/ directory)
cd apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install

# Build debug APK (faster, no signing)
cd apps/expo-multi-tv/android && ./gradlew assembleDebug

# Or use expo run (does both prebuild + build)
cd apps/expo-multi-tv && EXPO_TV=1 npx expo run:android --no-install

# APK location
find android -name "*.apk" -path "*debug*"
# → android/app/build/outputs/apk/debug/app-debug.apk

# Install
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
