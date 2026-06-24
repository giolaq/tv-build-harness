---
name: kmp-compose-tv
description: "Compose for TV patterns: TvLazyRow/Column, focusable cards, FocusRequester, D-pad navigation, and 10-foot UI composables"
applies_to: [screens, content, scaffold]
load_when: writing Compose TV screens, fixing focus issues, or building TV UI components
---

# Compose for TV

> The Android TV app uses `androidx.tv:tv-foundation` and `androidx.tv:tv-material` for TV-optimized Compose components. These provide built-in D-pad navigation, focus handling, and TV-appropriate interaction patterns.

## Core TV components

### TvLazyRow — horizontal content rails

```kotlin
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items

TvLazyRow(
    contentPadding = PaddingValues(horizontal = 48.dp),
    horizontalArrangement = Arrangement.spacedBy(16.dp),
) {
    items(contentItems, key = { it.id }) { item ->
        TVCard(
            item = item,
            onItemClick = { /* navigate to detail */ },
            onItemFocused = { /* update hero banner */ },
        )
    }
}
```

**When to use:** Any horizontal scrolling content row — category rails, "continue watching", recommendations.

**Key points:**
- Always provide `key = { it.id }` for stable focus restoration
- `contentPadding` with 48dp horizontal gives breathing room from screen edges
- `Arrangement.spacedBy(16.dp)` for consistent card spacing

### TvLazyColumn — vertical scrollable layout

```kotlin
import androidx.tv.foundation.lazy.list.TvLazyColumn

TvLazyColumn(
    modifier = Modifier.fillMaxWidth().weight(1f),
    contentPadding = PaddingValues(top = 24.dp, bottom = 48.dp),
) {
    categoryList.forEachIndexed { index, (genre, items) ->
        item {
            ContentRow(title = genre, items = items)
        }
    }
}
```

**When to use:** Home screen layout containing multiple rails, settings lists, any vertical scroll.

### Surface (tv-material) — focusable containers

```kotlin
import androidx.tv.material3.Surface
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.ClickableSurfaceDefaults

@OptIn(ExperimentalTvMaterial3Api::class)
Surface(
    onClick = { onItemClick(item) },
    modifier = modifier.width(220.dp).aspectRatio(16f / 9f),
    tonalElevation = if (isFocused) 8.dp else 2.dp,
    colors = ClickableSurfaceDefaults.colors(
        containerColor = Color.Transparent,
        focusedContainerColor = Color.Transparent,
    ),
    shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(8.dp)),
) {
    // Card content
}
```

**Key:** `Surface` from `androidx.tv.material3` (not regular material3) handles focus states natively. It responds to D-pad select without custom click handling.

## Focus management

### FocusRequester — programmatic focus control

```kotlin
val focusRequester = remember { FocusRequester() }

// Apply to the element that should receive initial focus
TvLazyRow {
    items(items) { item ->
        TVCard(
            modifier = if (item == items.first()) {
                Modifier.focusRequester(focusRequester)
            } else Modifier,
        )
    }
}

// Request focus after content loads
LaunchedEffect(items) {
    if (items.isNotEmpty()) {
        focusRequester.requestFocus()
    }
}
```

**When to use:**
- Setting initial focus when a screen loads
- Restoring focus after data refresh
- Moving focus programmatically (e.g., after dialog dismissal)

### onFocusChanged — reacting to focus

```kotlin
Modifier.onFocusChanged { focusState ->
    isFocused = focusState.isFocused
    if (focusState.isFocused) {
        onItemFocused(item)  // e.g., update hero banner
    }
}
```

**Pattern:** The template uses focus changes on cards to drive the hero banner. When a card receives focus, it notifies the parent, which updates the hero image with a debounced crossfade.

### Focus-driven animations

```kotlin
val scale by animateFloatAsState(
    targetValue = if (isFocused) 1.08f else 1.0f,
    animationSpec = tween(durationMillis = 200),
    label = "cardScale",
)

Modifier
    .scale(scale)
    .then(
        if (isFocused) {
            Modifier.shadow(16.dp, shape).border(2.dp, Color.White, shape)
        } else Modifier
    )
```

**TV focus UX:** Cards scale up 8% + gain a white border + shadow when focused. This triple-cue (size + border + depth) ensures visibility from 10 feet.

## Building a TVCard (the template pattern)

The template's `TVCard.kt` is the canonical focusable content card:

```kotlin
@Composable
fun TVCard(
    item: ContentItem,
    onItemClick: (ContentItem) -> Unit,
    onItemFocused: (ContentItem) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(...)

    Surface(
        onClick = { onItemClick(item) },
        modifier = modifier
            .width(220.dp)
            .aspectRatio(16f / 9f)
            .scale(scale)
            .onFocusChanged {
                isFocused = it.isFocused
                if (it.isFocused) onItemFocused(item)
            }
            .then(if (isFocused) focusedModifiers else Modifier),
        // ...
    ) {
        // AsyncImage + gradient overlay + title text
    }
}
```

**Reuse this pattern.** Don't build cards from scratch — copy TVCard and adjust content.

## D-pad navigation

Compose for TV handles D-pad automatically through the focus system. The `TvLazyRow` and `TvLazyColumn` components manage:
- Left/Right moves focus between items in a row
- Up/Down moves between rows
- Select/Enter triggers `onClick` on the focused Surface

### BackHandler for back navigation

```kotlin
import androidx.activity.compose.BackHandler

BackHandler(enabled = showingDetail) {
    showingDetail = false
    selectedItem = null
}
```

**Always use BackHandler** for screen-back behavior. The Android TV remote's back button fires through this. Don't intercept hardware key events directly.

## Screen composition pattern

The template uses state-based screen switching in `MainScreen()`:

```kotlin
@Composable
private fun MainScreen() {
    var selectedItem by remember { mutableStateOf<ContentItem?>(null) }
    var showingDetail by rememberSaveable { mutableStateOf(false) }

    BackHandler(enabled = showingDetail) { showingDetail = false }

    when {
        showingDetail && selectedItem != null -> ContentDetailScreen(...)
        else -> HomeScreen(...)
    }
}
```

**Key insight:** No Jetpack Navigation library. Screen state is managed by boolean flags + `when` blocks. Simple and avoids Navigation Compose's focus restoration quirks on TV.

## Hero banner with focus-driven updates

```kotlin
@Composable
private fun HomeScreen(items: List<ContentItem>, ...) {
    var focusedItem by remember { mutableStateOf(items.firstOrNull()) }

    Column {
        HeroBanner(focusedItem)  // Updates as user navigates rails below
        TvLazyColumn { /* rails that call onFocusChanged = { focusedItem = it } */ }
    }
}
```

The hero image crossfades with a 250ms debounce to avoid flickering during fast navigation:

```kotlin
LaunchedEffect(item) {
    kotlinx.coroutines.delay(250)
    debouncedItem = item
}
Crossfade(targetState = debouncedItem, animationSpec = tween(600)) { ... }
```

## Anti-patterns

- **Using regular `LazyRow`/`LazyColumn` instead of `TvLazyRow`/`TvLazyColumn`.** The TV variants handle focus traversal between items. Regular Lazy components don't.
- **Adding `clickable {}` modifier to items inside TV Surface.** Surface already handles clicks via D-pad select. Adding clickable causes double-handling.
- **`focusRequester.requestFocus()` in composition (not in LaunchedEffect/callback).** Causes infinite recomposition loops. Always call from effects or event handlers.
- **Nesting focusable Surfaces.** A focusable inside a focusable confuses the focus system. Only the leaf-level items should be focusable.
- **Forgetting `key` in `items()` calls.** Without stable keys, focus position is lost on recomposition. Always use `items(list, key = { it.id })`.
- **Hero updates without debounce.** Fast D-pad scrolling triggers rapid focus changes. Without delay, the hero flickers. Always debounce hero content updates by 200-300ms.
