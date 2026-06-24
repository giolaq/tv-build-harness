---
name: kmp-template-anatomy
description: "KMP TV template repo structure: shared-core, androidtv-app, appletv-app modules and where screens, theme, data, and navigation live"
applies_to: [scaffold, branding, content, screens]
load_when: any time the agent reads or writes KMP project files
---

# KMP Template Anatomy

> The base template is `kmptv` — a Kotlin Multiplatform project targeting Android TV (Compose for TV) and Apple TV (SwiftUI). Knowing where things live prevents editing the wrong module.

## Top-level layout

```
kmptv/
├── settings.gradle.kts       # Declares :shared-core and :androidtv-app modules
├── build.gradle.kts           # Root plugins: kotlin multiplatform 1.9.24, AGP 8.2.2
├── gradle.properties          # Kotlin/JVM settings
├── shared-core/               # Kotlin Multiplatform shared code (models, data, services)
├── androidtv-app/             # Android TV app (Compose for TV)
├── appletv-app/               # Apple TV app (SwiftUI, Xcode project)
└── gradle/wrapper/            # Gradle wrapper (8.9)
```

## `shared-core/` — the shared data layer

This is a Kotlin Multiplatform library consumed by both platform apps. It compiles for Android and iOS (for Apple TV via iOS targets).

```
shared-core/
├── build.gradle.kts                    # KMP plugin, serialization, android-library
└── src/
    ├── commonMain/kotlin/
    │   ├── models/
    │   │   ├── ContentItem.kt          # Core data class: id, title, thumbnailUrl, videoUrl, metadata
    │   │   ├── Metadata.kt             # ContentMetadata (genre, rating, releaseDate, duration)
    │   │   ├── Types.kt                # ContentType enum (Video, Audio, Image, Mixed)
    │   │   ├── TVApplication.kt        # App config model
    │   │   ├── UserSession.kt          # Session state
    │   │   └── Result.kt               # Result<T> sealed class (Success/Error)
    │   ├── repositories/
    │   │   └── ContentRepository.kt    # Interface + impl: getContentItems, searchContent, markAccessed
    │   ├── services/
    │   │   ├── CatalogService.kt       # CatalogSource interface + JSON catalog loader
    │   │   ├── SessionManager.kt       # Auth/session lifecycle
    │   │   └── TVApplicationManager.kt # App state management
    │   └── di/
    │       └── ServiceLocator.kt       # Manual DI: contentRepository(), sessionManager()
    ├── commonTest/kotlin/contract/     # Contract tests for repositories and services
    ├── androidMain/kotlin/             # Android-specific: OkHttp Ktor engine
    └── iosMain/kotlin/                 # iOS-specific: Darwin Ktor engine
```

**Key dependencies (commonMain):**
- `kotlinx-coroutines-core:1.8.1`
- `kotlinx-serialization-json:1.6.3`
- `kotlinx-datetime:0.6.0`
- `ktor-client-core:2.3.12` (+ content-negotiation, kotlinx-json serialization)

## `androidtv-app/` — Compose for TV

Single-activity app using Compose for TV components.

```
androidtv-app/
├── build.gradle.kts                           # AGP + Compose (extension 1.5.14)
└── src/main/
    ├── AndroidManifest.xml                    # Leanback launcher, LEANBACK_ONLY feature
    ├── java/com/kmptv/androidtv/
    │   ├── MainActivity.kt                    # Single activity: setContent { KMPTVTheme { MainScreen() } }
    │   ├── compose/
    │   │   ├── TVCard.kt                      # Focusable card with scale animation + border on focus
    │   │   ├── FocusModifiers.kt              # transparentSurfaceColors() helper
    │   │   ├── ContentDetailScreen.kt         # Detail view with metadata + Play button
    │   │   └── VideoPlayerScreen.kt           # ExoPlayer-based video playback
    │   └── theme/
    │       ├── Color.kt                       # KmptvColors object (Background, SurfaceElevated, Accent)
    │       ├── Theme.kt                       # KMPTVTheme composable wrapping darkColorScheme()
    │       └── Type.kt                        # Typography definitions
    └── res/
        ├── drawable/tv_banner.xml
        ├── values/strings.xml, themes.xml
        └── xml/searchable.xml

```

**Key dependencies:**
- `androidx.tv:tv-foundation:1.0.0-alpha10` (TvLazyRow, TvLazyColumn)
- `androidx.tv:tv-material:1.0.0-alpha10` (Surface, ClickableSurfaceDefaults)
- `androidx.compose.material3:material3:1.2.1`
- `io.coil-kt:coil-compose:2.6.0` (image loading)
- `androidx.media3:media3-exoplayer:1.4.1` (video playback)
- `project(":shared-core")` (shared data layer)

## `appletv-app/` — SwiftUI for tvOS

Xcode project with SwiftUI views. Does NOT consume shared-core as a KMP framework yet (uses its own Swift models mirroring the Kotlin ones).

```
appletv-app/kmptv/kmptv/
├── kmptvApp.swift              # App entry point
├── ContentView.swift           # Root view with navigation
├── HomeView.swift              # Main browse screen with hero + category rows
├── HeroBannerView.swift        # Featured content banner
├── CategoryRowView.swift       # Horizontal scroll row
├── TVCardView.swift            # Focusable card (ButtonStyle-based focus)
├── TVCardButtonStyle.swift     # Custom ButtonStyle with scale on focus
├── TVFocusButtonStyle.swift    # Focus appearance styling
├── ContentDetailView.swift     # Detail screen
├── VideoPlayerView.swift       # AVPlayer wrapper
├── ContentItem.swift           # Swift mirror of Kotlin ContentItem
└── CatalogFeed.swift           # JSON catalog loader (Swift-native)
```

## Where new content goes

| You want to add...              | Put it here                                          |
|--------------------------------|------------------------------------------------------|
| A new data model               | `shared-core/src/commonMain/kotlin/models/`          |
| A new repository               | `shared-core/src/commonMain/kotlin/repositories/`    |
| A new service                  | `shared-core/src/commonMain/kotlin/services/`        |
| Content manifest (JSON)        | Load via CatalogService (URL or bundled asset)       |
| A new Compose screen           | `androidtv-app/src/main/java/.../compose/`           |
| A new Compose component        | `androidtv-app/src/main/java/.../compose/`           |
| Theme colors                   | `androidtv-app/.../theme/Color.kt`                   |
| A new Swift screen             | `appletv-app/kmptv/kmptv/`                           |
| Platform-specific Ktor engine  | `shared-core/src/{androidMain,iosMain}/kotlin/`      |

## Navigation model

The Android TV app uses in-activity state-based navigation (no Jetpack Navigation library):
- `showingDetail` / `showingVideoPlayer` state variables in `MainScreen()`
- `BackHandler` for back-stack behavior
- Screen transitions via `Crossfade` animation

The Apple TV app uses SwiftUI NavigationStack patterns.

## Build commands (quick reference)

```bash
# Compile shared-core (validates Kotlin types across all targets)
./gradlew :shared-core:compileKotlinAndroid

# Build Android TV debug APK
./gradlew :androidtv-app:assembleDebug

# Run shared-core tests
./gradlew :shared-core:allTests

# Full project compilation check
./gradlew compileKotlin
```

## Dangerous places — touch with care

- `shared-core/build.gradle.kts` — KMP target configuration. Adding/removing targets breaks the build for the other platform.
- `settings.gradle.kts` — module inclusion. Must match actual directory names exactly.
- `ServiceLocator.kt` — manual DI. If you add a new service, wire it here or it won't be available at runtime.
- iOS framework settings (`isStatic = true`, `baseName`) — changing these requires Xcode project updates.
- `composeOptions.kotlinCompilerExtensionVersion` — must match the Kotlin version or Compose won't compile.
