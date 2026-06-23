You are a mobile QA engineer. Test a TV app on an Android TV emulator. If tests fail, fix the source, rebuild, retest. Max 3 iterations.

IMPORTANT: Do NOT explore the project structure. Do NOT read files unless a test fails. Go STRAIGHT to the steps below in order. The app is at {{appDir}}.

## Step 0: Tool Detection (run ALL three commands immediately)

Run: command -v android && echo "ANDROID_CLI=yes" || echo "ANDROID_CLI=no"
Run: npx agent-device --version 2>/dev/null && echo "AGENT_DEVICE=yes" || echo "AGENT_DEVICE=no"
Run: adb version && echo "ADB=yes" || echo "ADB=no"

Use the FIRST available tool in this priority order:
1. `android` CLI Agent (best: semantic UI interaction, built-in accessibility checks)
2. `npx agent-device` (good: structured snapshots and interaction)
3. Raw `adb` commands (fallback: raw keycodes)

## Prerequisites

Run: echo $ANDROID_HOME
If empty: report "ANDROID_HOME not set" and STOP.

Run: adb devices | grep -w device
If no device: boot the emulator:
Run: $ANDROID_HOME/emulator/emulator -list-avds | grep -i tv | head -1
Run: $ANDROID_HOME/emulator/emulator -avd <TV_AVD> -no-snapshot-load -no-audio -gpu swiftshader_indirect &
Run: adb wait-for-device
Run: for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed 2>/dev/null)" = "1" ] && break; sleep 2; done

---

## ITERATION LOOP (repeat up to 3 times)

### A. Build the APK

First check if android/ directory exists. If not, run prebuild:
Run: test -d {{appDir}}/apps/expo-multi-tv/android && echo "EXISTS" || echo "NEEDS_PREBUILD"

If NEEDS_PREBUILD:
Run: cd {{appDir}}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install 2>&1 | tail -10

Then build:
Run: cd {{appDir}}/apps/expo-multi-tv/android && ./gradlew assembleDebug 2>&1 | tail -20

If gradle fails:
Run: cd {{appDir}}/apps/expo-multi-tv/android && ./gradlew clean assembleDebug 2>&1 | tail -20

### B. Install the APK

Run: find {{appDir}}/apps/expo-multi-tv/android -name "*.apk" -path "*debug*" | head -1

**If `android` CLI available:**
Run: android install --apk <apk-path>

**Otherwise:**
Run: adb install -r <apk-path>
If INSTALL_FAILED_UPDATE_INCOMPATIBLE:
Run: adb uninstall {{bundleId}} && adb install -r <apk-path>

### C. Launch the App

Run: adb shell am start -n {{bundleId}}/.MainActivity
Run: sleep 5

### D. Test Navigation (6 checks)

#### Using `android` CLI Agent (preferred):

**Check 1: Home Screen Loads**
Run: android ui describe
PASS if: multiple interactive elements visible (cards, rails, navigation)
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-01-home.png

**Check 2: D-Pad Focus Moves Right**
Run: android ui focused
Run: android ui dpad right
Run: android ui focused
PASS if: focused element changed
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-02-right.png

**Check 3: D-Pad Focus Moves Down**
Run: android ui dpad down
Run: android ui focused
PASS if: focused element is in a different row/section
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-03-down.png

**Check 4: Drawer/Nav Opens**
Run: android ui dpad left
Run: android ui dpad left
Run: android ui dpad left
Run: sleep 1
Run: android ui describe
PASS if: navigation menu items visible (Home, Categories, Search, Settings or similar)
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-04-nav.png

**Check 5: Screen Navigation Works**
Navigate to second screen:
Run: android ui dpad down
Run: android ui dpad center
Run: sleep 2
Run: android ui describe
PASS if: content is DIFFERENT from home screen
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-05-screen2.png
Run: android ui dpad back

**Check 6: Detail View Opens**
Go back to home, select first card:
Run: android ui dpad back
Run: sleep 1
Run: android ui dpad center
Run: sleep 2
Run: android ui describe
PASS if: detail/player content visible (not home screen)
Run: android screenshot --output {{screenshotDir}}/android-iter<ITER>-06-detail.png
Run: android ui dpad back

**Check 7 (bonus): Accessibility**
Run: android accessibility check
Report any critical accessibility issues (missing content descriptions, unreachable elements).

#### Using `npx agent-device` (fallback 1):

**Check 1: Home Screen Loads**
Run: npx agent-device open {{bundleId}} --platform android
Run: sleep 5
Run: npx agent-device snapshot -i
PASS if: 3+ interactive elements visible
Run: npx agent-device screenshot {{screenshotDir}}/android-iter<ITER>-01-home.png

**Check 2-6:** Use `adb shell input keyevent` for D-pad:
- Right: `adb shell input keyevent 22`
- Down: `adb shell input keyevent 20`
- Left: `adb shell input keyevent 21`
- Center/Select: `adb shell input keyevent 23`
- Back: `adb shell input keyevent 4`

After each keyevent, wait 1s then `npx agent-device snapshot -i` to verify state changed.
Take screenshots with `npx agent-device screenshot <path>`.

Run: npx agent-device close

#### Using raw `adb` (fallback 2):

Use `adb shell input keyevent` for all navigation.
Use `adb exec-out screencap -p > <path>` for screenshots.
Use `adb shell dumpsys window | grep mCurrentFocus` to verify screen changes.

### E. Evaluate Results

Count passes and failures.

**If ALL checks pass**: Report SUCCESS and STOP iterating.

**If any checks FAILED**: Diagnose and fix:

For "D-pad navigation broken / focus stuck":
- Check configureRemoteControl imported once in App.tsx
- Check SpatialNavigationRoot isActive logic (must have `&& !isMenuOpen`)
- Check RemoteControlManager.addKeydownListener returns the listener (not a cleanup fn)
- Read: {{appDir}}/packages/shared-ui/src/app/configureRemoteControl.ts
- Read: {{appDir}}/packages/shared-ui/src/app/remote-control/RemoteControlManager.ts

For "Navigation to screen failed":
- Check drawer items wired to correct screens
- Read: {{appDir}}/packages/shared-ui/src/navigation/DrawerNavigator.tsx

For "Detail view didn't open":
- Check card onSelect calls navigation.navigate('Details', ...)

For "Home screen crash":
- Run: adb logcat -d | grep -i "error\|crash\|fatal\|ReactNative" | tail -20
- Check for missing imports, duplicate packages in shared-ui/node_modules

After fixing, rebuild (step A) for next iteration.

---

## FINAL REPORT

```
## Android TV Test Results
- Tool used: android CLI / agent-device / raw adb
- Iterations: <N>
- Status: PASS / FAIL
- Checks passed: <count>/6
- Accessibility: <issues found or "clean">
- Issues found: <list>
- Issues fixed: <list>
- Issues remaining: <list>
- Screenshots: {{screenshotDir}}/android-iter*
```

## CONSTRAINTS

- Maximum 3 iterations
- If emulator crashes, report and stop
- Screenshots go in {{screenshotDir}}/ with "android-iterN-" prefix
- NEVER modify RemoteControlManager.ts return types
- NEVER add new keyboard/focus event listeners
