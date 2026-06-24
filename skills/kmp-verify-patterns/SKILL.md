---
name: kmp-verify-patterns
description: "How to verify KMP builds: compile checks, lint, common Compose compiler errors, Gradle dependency resolution issues"
applies_to: [scaffold, screens, branding, content]
load_when: verifying code compiles, debugging build errors, or running static analysis
---

# KMP Verify Patterns

> After any code change, verify it compiles. Kotlin's type system catches most issues at compile time — if it compiles, it's likely correct. The cost of skipping verification is runtime crashes on the TV.

## Quick verification commands

### Type checking (fastest feedback)

```bash
# Compile shared-core for all targets (Kotlin multiplatform)
./gradlew :shared-core:compileKotlinAndroid

# Compile Android TV app (includes Compose compiler)
./gradlew :androidtv-app:compileDebugKotlin

# Full project compilation (all modules, all targets)
./gradlew compileKotlin
```

**Use `:shared-core:compileKotlinAndroid`** after editing models/repositories — it's fast (10-20s) and catches type errors across the shared layer.

**Use `:androidtv-app:compileDebugKotlin`** after editing Compose screens — it runs the Compose compiler plugin which catches composable-specific errors.

### Lint / static analysis

```bash
# Android lint (catches common issues)
./gradlew :androidtv-app:lint

# Lint report location
# androidtv-app/build/reports/lint-results-debug.html
```

### Run tests

```bash
# Shared-core unit tests (contract tests for repositories)
./gradlew :shared-core:allTests

# Android TV instrumented tests (requires emulator)
./gradlew :androidtv-app:connectedDebugAndroidTest
```

## Common Compose compiler errors

### 1. `@Composable invocations can only happen from the context of a @Composable function`

**Cause:** Calling a composable from a non-composable (lambda, regular function).

**Fix:** Mark the containing function or lambda as `@Composable`:

```kotlin
// WRONG
val items = list.map { item -> Text(item.title) }

// RIGHT
list.forEach { item ->
    Text(item.title)  // Already inside a @Composable context
}
```

### 2. `Type mismatch: inferred type is Unit but ... was expected`

**Cause:** Compose content lambdas return Unit. If you're assigning the result of a composable call, that's wrong.

**Fix:** Composables are side-effects, not return values. Use state instead:

```kotlin
// WRONG
val text = Text("hello")  // Text returns Unit

// RIGHT
Text("hello")  // Just call it in the composition
```

### 3. `None of the following functions can be called with the arguments supplied`

**Cause:** Often the wrong `Surface` import. `androidx.tv.material3.Surface` vs `androidx.compose.material3.Surface` have different signatures.

**Fix:** Use TV Surface for focusable containers:

```kotlin
import androidx.tv.material3.Surface  // TV version with onClick
// NOT: import androidx.compose.material3.Surface
```

### 4. `Unresolved reference: ExperimentalTvMaterial3Api`

**Cause:** Missing TV Material dependency.

**Fix:** Ensure `build.gradle.kts` has:

```kotlin
implementation("androidx.tv:tv-material:1.0.0-alpha10")
```

And opt-in at the function level:

```kotlin
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MyTVComponent() { ... }
```

### 5. `Modifier.focusRequester must be used with a FocusRequester that is remember'd`

**Cause:** Creating FocusRequester without `remember`.

**Fix:**
```kotlin
val focusRequester = remember { FocusRequester() }  // Always remember it
```

### 6. `kotlinCompilerExtensionVersion` mismatch

**Cause:** Compose compiler version doesn't match Kotlin version.

**Fix:** For Kotlin 1.9.24, use:
```kotlin
composeOptions {
    kotlinCompilerExtensionVersion = "1.5.14"
}
```

Compatibility table: https://developer.android.com/jetpack/androidx/releases/compose-kotlin

## Gradle dependency resolution issues

### `Could not resolve` / `Failed to resolve`

**Cause:** Missing repository or version conflict.

**Check:**
1. `settings.gradle.kts` has `google()` and `mavenCentral()` in repositories
2. The dependency version exists (check on Maven Central or Google Maven)
3. No conflicting versions via `./gradlew dependencies`

### `Duplicate class found`

**Cause:** Two dependencies provide the same class.

**Fix:** Add exclusion:
```kotlin
implementation("some:library:1.0") {
    exclude(group = "conflicting.group", module = "conflicting-module")
}
```

Or use resolution strategy:
```kotlin
configurations.all {
    resolutionStrategy {
        force("conflicting.group:conflicting-module:1.0")
    }
}
```

### `Cannot access class ... from module`

**Cause:** Using a class from shared-core without proper module dependency.

**Fix:** Ensure `androidtv-app/build.gradle.kts` has:
```kotlin
dependencies {
    implementation(project(":shared-core"))
}
```

### Kotlin version conflicts across modules

**Cause:** Root and module `build.gradle.kts` declare different Kotlin versions.

**Fix:** Declare Kotlin version only in root `build.gradle.kts`:
```kotlin
plugins {
    kotlin("multiplatform") version "1.9.24" apply false
    kotlin("android") version "1.9.24" apply false
}
```

Modules reference without version:
```kotlin
plugins {
    kotlin("android")  // version comes from root
}
```

## Verification workflow after code changes

1. **After editing shared-core models/services:**
   ```bash
   ./gradlew :shared-core:compileKotlinAndroid && ./gradlew :shared-core:allTests
   ```

2. **After editing Compose screens/components:**
   ```bash
   ./gradlew :androidtv-app:compileDebugKotlin
   ```

3. **After editing build.gradle.kts (dependencies):**
   ```bash
   ./gradlew --refresh-dependencies :androidtv-app:assembleDebug
   ```

4. **After major refactoring (full check):**
   ```bash
   ./gradlew clean compileKotlin lint
   ```

## Reading error output

Gradle output is verbose. Focus on:

```
e: file:///path/to/File.kt:42:15 Error message here
```

The `e:` prefix means error. The path and line number point to the exact issue. Ignore the hundreds of lines of task execution output above it.

**Quick filter:**
```bash
./gradlew :androidtv-app:compileDebugKotlin 2>&1 | grep "^e:"
```

## Anti-patterns

- **Skipping compilation after "simple" changes.** Kotlin's type system is strict. A missing import, wrong parameter type, or composable context violation will crash at runtime if not caught at compile time.
- **Running `assembleDebug` for type checking.** It's slower because it packages the APK. Use `compileDebugKotlin` for fast feedback.
- **Ignoring lint warnings.** Many lint checks (e.g., missing content descriptions, deprecated API usage) become runtime issues on TV certification.
- **Not checking both modules.** A change in shared-core can break androidtv-app. Always compile downstream consumers after upstream changes.
- **`./gradlew clean` before every build.** Only use clean when you suspect stale caches. It adds 30-60s for no benefit in normal development.
