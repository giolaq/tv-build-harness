---
name: android-cli-agent
description: "Android CLI Agent integration for building, installing, and testing TV apps on Android TV emulators with semantic UI interaction"
applies_to: [android_test_loop]
---

# Android CLI Agent

The Android CLI Agent (`android` command from Android Studio) provides semantic interaction with Android devices — it understands UI elements, can navigate by intent, and provides structured feedback about the app state.

## Installation

The Android CLI Agent is part of Android Studio 2025.2+ or can be installed standalone:
```bash
# Check if available
android --version

# If not, install via Android Studio command-line tools
sdkmanager "cmdline-tools;latest"
```

## Key Commands

### Build & Install
```bash
# Build the debug APK
android build --project-dir <app>/apps/expo-multi-tv/android

# Install on connected device/emulator
android install --apk <path-to-apk>

# Or combined
android run --project-dir <app>/apps/expo-multi-tv/android
```

### UI Interaction (semantic, not coordinate-based)
```bash
# Describe what's on screen (accessibility tree)
android ui describe

# Interact with elements by description
android ui tap "Play button"
android ui focus "First card in rail"

# D-pad navigation
android ui dpad up|down|left|right|center|back

# Wait for a specific state
android ui wait "Loading spinner gone"
```

### Screenshots & Verification
```bash
# Take a screenshot
android screenshot --output <path>

# Get UI hierarchy as JSON
android ui dump --format json

# Check accessibility
android accessibility check
```

### Logcat & Debugging
```bash
# Filter logs for the app
android logcat --package <bundle-id> --level error

# Clear and capture fresh logs
android logcat --clear
android logcat --package <bundle-id> --duration 10s
```

## TV-Specific Patterns

### D-Pad Navigation Testing
```bash
# Navigate through focusable elements
android ui dpad right    # Move focus right
android ui dpad down     # Move to next row
android ui dpad center   # Select/press focused item

# The agent reports which element is focused after each action
```

### Focus Verification
```bash
# Get the currently focused element
android ui focused

# Verify focus moved
android ui dpad right
android ui focused  # Should be different from before
```

### Screen Transition Verification
```bash
# Check current activity/screen
android ui describe --brief

# Navigate and verify screen changed
android ui dpad center  # Select item
android ui wait "new screen loaded"
android ui describe --brief  # Should be different
```

## Integration with TV App Harness

The Android CLI Agent replaces raw `adb shell input keyevent` commands with semantic actions:

| Old approach (adb) | New approach (android CLI) |
|---|---|
| `adb shell input keyevent 20` | `android ui dpad down` |
| `adb shell input keyevent 23` | `android ui dpad center` |
| `adb shell dumpsys window \| grep mCurrentFocus` | `android ui focused` |
| `adb shell uiautomator dump` | `android ui dump --format json` |
| Manual APK path finding | `android build` + `android install` |

### Advantages over raw adb:
1. **Semantic understanding** — interact by element description, not coordinates
2. **Built-in wait/retry** — handles loading states automatically
3. **Structured output** — JSON responses parseable by the harness
4. **Accessibility-aware** — can verify focus indicators, content descriptions
5. **Error reporting** — clear messages when interactions fail

## Fallback Strategy

If `android` CLI is not available, fall back to the existing approach:
1. `adb shell input keyevent` for D-pad
2. `npx agent-device` for snapshots/screenshots (if available)
3. Raw `adb shell uiautomator dump` for UI hierarchy
