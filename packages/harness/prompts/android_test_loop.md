You are a mobile QA engineer testing a TV app on an Android TV emulator using agent-device.

## Prerequisites Check

Run these checks first. If any fail, report the failure and skip the rest:

1. Check agent-device is installed:
Run: agent-device --version
If "command not found": report "agent-device not installed. Run: npm install -g agent-device" and STOP.

2. Check Android SDK:
Run: echo $ANDROID_HOME
If empty: report "ANDROID_HOME not set" and STOP.

3. Check ADB:
Run: adb devices
If fails: report "ADB not on PATH" and STOP.

4. Find the Android TV AVD:
Run: $ANDROID_HOME/emulator/emulator -list-avds
Look for an AVD with "tv" or "TV" in the name (case-insensitive). Save the EXACT name for later.
If none found: report "No Android TV AVD found. Create one with: avdmanager create avd -n TV_API_34 -k 'system-images;android-34;android-tv;x86_64' -d tv_1080p" and STOP.

## STEP 1: Build the Android APK

Run: cd {{appDir}}/apps/expo-multi-tv && EXPO_TV=1 npx expo run:android --no-install 2>&1 | tail -30

This builds the debug APK without installing. It may take 3-5 minutes on first run.

If it fails with missing SDK or build tools, try:
Run: cd {{appDir}}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install 2>&1 | tail -10
Run: cd {{appDir}}/apps/expo-multi-tv/android && ./gradlew assembleDebug 2>&1 | tail -20

## STEP 2: Find the APK

Run: find {{appDir}}/apps/expo-multi-tv/android -name "*.apk" -path "*debug*" | head -5

The APK should be at: `android/app/build/outputs/apk/debug/app-debug.apk`
Save the path for the next step.

## STEP 3: Boot the Android TV Emulator

Check if an emulator is already running:
Run: adb devices | grep emulator

If no emulator is running, start the TV AVD you found in the prerequisite check (use the EXACT name from `emulator -list-avds`):
Run: $ANDROID_HOME/emulator/emulator -avd <TV_AVD_NAME> -no-snapshot-load -no-audio -gpu swiftshader_indirect &
Run: adb wait-for-device

Wait for full boot:
Run: for i in $(seq 1 60); do if [ "$(adb shell getprop sys.boot_completed 2>/dev/null)" = "1" ]; then echo "Booted"; break; fi; sleep 2; done

## STEP 4: Install the APK

Run: adb install -r <apk-path-from-step-2>

If install fails with "INSTALL_FAILED_UPDATE_INCOMPATIBLE":
Run: adb uninstall {{bundleId}} && adb install -r <apk-path>

## STEP 5: Open the App with agent-device

Run: agent-device open {{bundleId}} --platform android

Wait for the app to launch:
Run: sleep 5

## STEP 6: Verify Home Screen

Run: agent-device snapshot -i

Check the output for interactive elements (refs like @e1, @e2, etc.).
The home screen should have:
- Focusable cards/tiles
- Navigation elements (drawer items or tabs)
- Text content matching the app's brand

Take a screenshot of the initial state:
Run: agent-device screenshot {{screenshotDir}}/android-01-home.png

## STEP 7: Test D-Pad Navigation

Test focus movement with D-pad keys:

1. Press Right:
Run: agent-device key dpad_right
Run: sleep 1
Run: agent-device screenshot {{screenshotDir}}/android-02-right.png

2. Press Right again:
Run: agent-device key dpad_right
Run: sleep 1
Run: agent-device screenshot {{screenshotDir}}/android-03-right2.png

3. Press Down:
Run: agent-device key dpad_down
Run: sleep 1
Run: agent-device screenshot {{screenshotDir}}/android-04-down.png

4. Press Down again (scroll to second row):
Run: agent-device key dpad_down
Run: sleep 1
Run: agent-device screenshot {{screenshotDir}}/android-05-down2.png

After each key press, run `agent-device snapshot -i` to verify the focused element changed. If focus doesn't move after 2+ presses, report "D-pad navigation broken — focus stuck".

## STEP 8: Test Navigation (Drawer/Tabs)

Open the drawer (press Left from home):
Run: agent-device key dpad_left
Run: sleep 1
Run: agent-device snapshot -i
Run: agent-device screenshot {{screenshotDir}}/android-06-drawer.png

Navigate to each screen. The app has these routes: {{routesList}}

For each route:
1. Move down to the nav item: `agent-device key dpad_down`
2. Take snapshot to confirm the item is focused
3. Select it: `agent-device key dpad_center`
4. Wait: `sleep 2`
5. Take snapshot to verify screen changed
6. Take screenshot: `agent-device screenshot {{screenshotDir}}/android-07-screen-<name>.png`
7. Verify the screen content is DIFFERENT from home (if same, report "Navigation to <route> failed")
8. Go back: `agent-device key back`
9. Wait: `sleep 1`
10. Re-open drawer: `agent-device key dpad_left`

## STEP 9: Test Detail View

Go back to home, select the first card:
Run: agent-device key back
Run: sleep 1
Run: agent-device key dpad_center
Run: sleep 2
Run: agent-device snapshot -i
Run: agent-device screenshot {{screenshotDir}}/android-08-detail.png

Verify the detail view opened (content should be different from home).
Go back:
Run: agent-device key back
Run: sleep 1

## STEP 10: Close and Report

Run: agent-device close

Report results:
- How many screens were successfully navigated to
- Whether D-pad focus moved correctly
- Whether detail view opened
- Any screens that failed to load or showed wrong content
- Total screenshots captured

## CONSTRAINTS

- If agent-device commands fail with "no session", re-run `agent-device open {{bundleId}} --platform android`
- If the emulator crashes, skip remaining tests and report what was captured
- Do NOT modify app code in this phase — only test what was built
- Screenshots go in {{screenshotDir}}/ with "android-" prefix
- Keep the emulator running after tests (for manual inspection)
