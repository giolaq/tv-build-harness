---
name: kmp-build-commands
description: "Gradle build commands: assembleDebug, assembleRelease, APK output paths, and emulator installation"
applies_to: [scaffold, screens, branding, content]
load_when: building the app, installing on emulator, or locating build artifacts
---

# KMP Build Commands

> The kmptv project uses Gradle with the Android Gradle Plugin. All builds run from the project root. The Android TV app produces an APK; the Apple TV app builds via Xcode.

## Android TV builds

### Debug APK (development)

```bash
./gradlew :androidtv-app:assembleDebug
```

**Output:** `androidtv-app/build/outputs/apk/debug/androidtv-app-debug.apk`

- Debuggable, not minified
- Fast build (~30-60s after first build)
- Use for emulator testing and development

### Release APK (production)

```bash
./gradlew :androidtv-app:assembleRelease
```

**Output:** `androidtv-app/build/outputs/apk/release/androidtv-app-release-unsigned.apk`

- Minified (if proguard is enabled, currently disabled in template)
- Not debuggable
- Requires signing for device installation

### Build both variants

```bash
./gradlew :androidtv-app:assemble
```

## Installing on emulator

### Prerequisites

- Android TV emulator running (API 34, TV profile recommended)
- `adb` in PATH (from Android SDK platform-tools)

### Install debug APK

```bash
# Build and install in one step
./gradlew :androidtv-app:installDebug

# Or manually after building
adb install androidtv-app/build/outputs/apk/debug/androidtv-app-debug.apk

# Force reinstall (overwrite existing)
adb install -r androidtv-app/build/outputs/apk/debug/androidtv-app-debug.apk
```

### Launch after install

```bash
adb shell am start -n com.kmptv.androidtv/.MainActivity
```

### Build + install + launch (one command)

```bash
./gradlew :androidtv-app:installDebug && adb shell am start -n com.kmptv.androidtv/.MainActivity
```

## Shared-core builds

### Compile for Android target

```bash
./gradlew :shared-core:compileKotlinAndroid
```

### Compile for iOS targets (requires macOS)

```bash
./gradlew :shared-core:compileKotlinIosArm64
./gradlew :shared-core:compileKotlinIosSimulatorArm64
./gradlew :shared-core:compileKotlinIosX64
```

### Run all shared-core tests

```bash
./gradlew :shared-core:allTests
```

### Generate iOS framework (for Apple TV app)

```bash
./gradlew :shared-core:linkDebugFrameworkIosSimulatorArm64
```

**Output:** `shared-core/build/bin/iosSimulatorArm64/debugFramework/shared_core.framework`

## Full project builds

### Compile everything

```bash
./gradlew compileKotlin
```

### Clean build (when caches are stale)

```bash
./gradlew clean :androidtv-app:assembleDebug
```

### Check dependencies

```bash
# Show dependency tree for androidtv-app
./gradlew :androidtv-app:dependencies --configuration releaseRuntimeClasspath

# Check for dependency updates (if plugin installed)
./gradlew dependencyUpdates
```

## Apple TV builds (Xcode)

The Apple TV app is built via Xcode, not Gradle:

```bash
# Open in Xcode
open appletv-app/kmptv/kmptv.xcodeproj

# Build from command line
xcodebuild -project appletv-app/kmptv/kmptv.xcodeproj \
    -scheme kmptv \
    -destination 'platform=tvOS Simulator,name=Apple TV 4K (3rd generation)' \
    build
```

## Build output locations

| Artifact                    | Path                                                          |
|----------------------------|---------------------------------------------------------------|
| Debug APK                  | `androidtv-app/build/outputs/apk/debug/androidtv-app-debug.apk` |
| Release APK                | `androidtv-app/build/outputs/apk/release/androidtv-app-release-unsigned.apk` |
| Lint report                | `androidtv-app/build/reports/lint-results-debug.html`         |
| Test results (shared-core) | `shared-core/build/reports/tests/`                            |
| iOS framework              | `shared-core/build/bin/iosSimulatorArm64/debugFramework/`     |

## Gradle wrapper

The project uses Gradle 8.9 via the wrapper. Always use `./gradlew` (not a system-installed `gradle`):

```bash
# Check Gradle version
./gradlew --version

# Update wrapper (if needed)
./gradlew wrapper --gradle-version 8.9
```

## Common build issues

### `SDK location not found`

**Fix:** Create `local.properties` in project root:
```properties
sdk.dir=/Users/<username>/Library/Android/sdk
```

Or set `ANDROID_HOME` environment variable.

### `compileOptions` / `jvmToolchain` mismatch

The project requires JDK 17:
```kotlin
kotlin { jvmToolchain(17) }
```

**Fix:** Ensure `JAVA_HOME` points to JDK 17:
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

### `Build cache is corrupted`

```bash
./gradlew clean
rm -rf ~/.gradle/caches/transforms-*
./gradlew :androidtv-app:assembleDebug
```

### Out of memory during build

Add to `gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4g -XX:+HeapDumpOnOutOfMemoryError
```

## Emulator management

### List available emulators

```bash
emulator -list-avds
```

### Start TV emulator

```bash
emulator -avd <avd-name> &
```

### Check connected devices

```bash
adb devices
```

### Useful adb commands for TV testing

```bash
# Send D-pad events
adb shell input keyevent KEYCODE_DPAD_UP
adb shell input keyevent KEYCODE_DPAD_DOWN
adb shell input keyevent KEYCODE_DPAD_LEFT
adb shell input keyevent KEYCODE_DPAD_RIGHT
adb shell input keyevent KEYCODE_DPAD_CENTER  # Select
adb shell input keyevent KEYCODE_BACK

# Take screenshot
adb exec-out screencap -p > screenshot.png

# View logs
adb logcat -s "kmptv" --format=brief

# Uninstall app
adb uninstall com.kmptv.androidtv
```

## Anti-patterns

- **Running `./gradlew assembleDebug` from a subdirectory.** Always run from project root where `gradlew` lives.
- **Using `gradle` instead of `./gradlew`.** System Gradle may be a different version and break the build.
- **Building release for development testing.** Release builds are slower and not debuggable. Use debug for iteration.
- **Skipping `installDebug` and manually copying the APK.** `installDebug` handles uninstall-reinstall and is faster.
- **Not checking `adb devices` before install.** If no device is connected, `installDebug` fails silently or with a confusing error.
