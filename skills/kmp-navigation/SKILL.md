---
name: kmp-navigation
description: "Compose Navigation for TV: state-based screen switching, BackHandler, focus-aware transitions, and drawer/sidebar patterns"
applies_to: [screens, scaffold]
load_when: adding new screens, changing navigation flow, or debugging back behavior
---

# KMP Navigation

> The kmptv template uses state-based navigation (not Jetpack Navigation Compose). This is intentional — Navigation Compose has known focus-restoration issues on TV that make it unreliable for D-pad apps.

## Navigation model

The Android TV app manages navigation via state variables in `MainScreen()`:

```kotlin
@Composable
private fun MainScreen() {
    var selectedItem by remember { mutableStateOf<ContentItem?>(null) }
    var showingDetail by rememberSaveable { mutableStateOf(false) }
    var showingVideoPlayer by rememberSaveable { mutableStateOf(false) }

    BackHandler(enabled = showingVideoPlayer || showingDetail) {
        if (showingVideoPlayer) {
            showingVideoPlayer = false
        } else if (showingDetail) {
            showingDetail = false
            selectedItem = null
        }
    }

    when {
        showingVideoPlayer && selectedItem?.videoUrl != null ->
            VideoPlayerScreen(item = selectedItem!!, onBack = { showingVideoPlayer = false })
        showingDetail && selectedItem != null ->
            ContentDetailScreen(item = selectedItem!!, onBack = { showingDetail = false })
        else ->
            HomeScreen(onItemClick = { item ->
                selectedItem = item
                showingDetail = true
            })
    }
}
```

### Why state-based, not NavHost

1. **Focus restoration:** NavHost loses focus position when popping the back stack. TV users expect to return to the exact card they left.
2. **Simplicity:** Three screens with boolean flags is easier to reason about than a NavGraph with arguments.
3. **Animation control:** `Crossfade` and custom transitions work naturally with `when` blocks.
4. **rememberSaveable:** Screen state survives configuration changes without NavGraph SavedState complexity.

## BackHandler — back stack behavior

```kotlin
import androidx.activity.compose.BackHandler

BackHandler(enabled = /* when this screen is active */) {
    // Pop this screen
}
```

**Rules:**
- Always provide `enabled` parameter scoped to the current screen. Without it, back handling fires when it shouldn't.
- Priority: innermost enabled BackHandler wins. So the player's BackHandler fires before the detail's.
- On the home screen, don't add a BackHandler — let the system handle app exit.

### Back stack ordering

```
Home (no BackHandler — system exits app)
  └── Detail (BackHandler → goes back to Home)
       └── VideoPlayer (BackHandler → goes back to Detail)
```

## Adding a new screen

1. **Create the composable** in `androidtv-app/src/main/java/.../compose/`:

```kotlin
@Composable
fun NewScreen(
    item: ContentItem,
    onBack: () -> Unit,
) {
    // Screen content
}
```

2. **Add state variable** in MainScreen:

```kotlin
var showingNewScreen by rememberSaveable { mutableStateOf(false) }
```

3. **Add to the `when` block** (order matters — more specific screens first):

```kotlin
when {
    showingVideoPlayer -> VideoPlayerScreen(...)
    showingNewScreen -> NewScreen(item = selectedItem!!, onBack = { showingNewScreen = false })
    showingDetail -> ContentDetailScreen(...)
    else -> HomeScreen(...)
}
```

4. **Add BackHandler** entry:

```kotlin
BackHandler(enabled = showingNewScreen) {
    showingNewScreen = false
}
```

## Screen transitions

The template uses `Crossfade` for the hero banner. For screen transitions, the `when` block provides an instant swap. To add animated transitions:

```kotlin
AnimatedContent(
    targetState = currentScreen,
    transitionSpec = {
        fadeIn(tween(300)) togetherWith fadeOut(tween(300))
    }
) { screen ->
    when (screen) {
        Screen.Home -> HomeScreen(...)
        Screen.Detail -> ContentDetailScreen(...)
        Screen.Player -> VideoPlayerScreen(...)
    }
}
```

**Caution:** Complex transitions can interfere with focus. Test that focus lands correctly after every transition.

## Drawer / sidebar navigation (pattern for multi-section apps)

For apps with multiple top-level sections (e.g., Home, Movies, TV Shows, Settings), add a navigation drawer:

```kotlin
@Composable
fun AppWithDrawer() {
    var currentSection by rememberSaveable { mutableStateOf(Section.Home) }
    var drawerOpen by remember { mutableStateOf(false) }
    val drawerFocusRequester = remember { FocusRequester() }

    Row(Modifier.fillMaxSize()) {
        // Drawer panel (collapsed by default, expands on focus/dpad-left)
        NavigationDrawer(
            isOpen = drawerOpen,
            sections = Section.values().toList(),
            selectedSection = currentSection,
            onSectionSelected = { section ->
                currentSection = section
                drawerOpen = false
            },
            modifier = Modifier.focusRequester(drawerFocusRequester),
        )

        // Content area
        Box(Modifier.weight(1f)) {
            when (currentSection) {
                Section.Home -> HomeScreen(...)
                Section.Movies -> CategoryScreen(genre = "Movies")
                Section.Settings -> SettingsScreen()
            }
        }
    }

    // Open drawer on left D-pad at screen edge
    BackHandler(enabled = drawerOpen) {
        drawerOpen = false
    }
}
```

### Drawer focus behavior

- **Opening:** When user presses D-pad Left at the leftmost focusable item, drawer expands and receives focus.
- **Closing:** Selecting an item or pressing D-pad Right returns focus to content.
- **Focus trap:** While open, focus stays within the drawer. D-pad Up/Down navigates items.

## Apple TV navigation (SwiftUI)

The Apple TV app uses SwiftUI's NavigationStack:

```swift
NavigationStack {
    HomeView()
        .navigationDestination(for: ContentItem.self) { item in
            ContentDetailView(item: item)
        }
}
```

SwiftUI handles focus restoration automatically on tvOS. The back button (Menu on Siri Remote) pops the stack natively.

## Anti-patterns

- **Using Jetpack Navigation Compose (NavHost) for TV.** Focus restoration is broken — after `popBackStack()`, focus jumps to the first focusable instead of the previously focused item. Use state-based navigation.
- **Forgetting `rememberSaveable` for screen state.** `remember` loses state on configuration change. Use `rememberSaveable` for navigation booleans.
- **Global BackHandler without `enabled` guard.** Intercepts back presses on every screen. Always scope with `enabled = specificScreenIsActive`.
- **Deep nesting of when blocks.** Keep navigation flat. If you have more than 4-5 screens, consider an enum-based approach:
  ```kotlin
  enum class Screen { Home, Detail, Player, Settings }
  var currentScreen by rememberSaveable { mutableStateOf(Screen.Home) }
  ```
- **Animated transitions that steal focus.** If focus disappears after a screen switch, the transition composable is likely consuming the focus event. Test with D-pad after every transition.
- **Not clearing selectedItem on back.** Stale state causes crashes when the next screen reads a null item. Always reset associated state when popping.
