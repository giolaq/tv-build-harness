---
name: kmp-theming
description: "Compose MaterialTheme patterns: Color.kt, Typography, darkColorScheme, and TV-specific theming for KMP apps"
applies_to: [branding, screens]
load_when: applying brand colors, creating/editing theme, or any color/typography request
---

# KMP Theming

> Theme lives in `androidtv-app/src/main/java/com/kmptv/androidtv/theme/`. A brand kit becomes a theme via darkColorScheme() customization plus a parallel KmptvColors object for TV-specific surfaces.

## File structure

```
androidtv-app/src/main/java/com/kmptv/androidtv/theme/
├── Color.kt    # KmptvColors object — TV-specific palette outside MaterialTheme
├── Theme.kt    # KMPTVTheme composable wrapping darkColorScheme()
└── Type.kt     # Typography definitions
```

## Two-layer color system

The template uses two complementary color approaches:

### Layer 1: MaterialTheme darkColorScheme (Material 3)

```kotlin
private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF90CAF9),       // CTAs, active states
    secondary = Color(0xFF81C784),     // Secondary actions
    tertiary = Color(0xFFFFB74D),      // Accents, highlights
    background = Color(0xFF0D0D0D),    // App background
    surface = Color(0xFF1E1E1E),       // Card surfaces
    onPrimary = Color(0xFF000000),     // Text on primary
    onSecondary = Color(0xFF000000),
    onTertiary = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),  // Body text
    onSurface = Color(0xFFFFFFFF),     // Text on cards
)
```

Access via `MaterialTheme.colorScheme.primary`, etc.

### Layer 2: KmptvColors object (TV-specific)

```kotlin
object KmptvColors {
    val Background = Color(0xFF0D0D0D)      // Near-black, avoids LCD haloing
    val SurfaceElevated = Color(0xFF1A1A1A) // Panels above background
    val SurfaceFocus = Color(0xFF2A2A2A)    // Unfocused controls
    val Accent = Color(0xFFE50914)          // Seek-bar, progress (brand red)
}
```

Direct reference: `KmptvColors.Background`. Used where MaterialTheme semantics don't map well to TV patterns (hero gradients, player controls, surface hierarchy).

## Applying brand colors

To rebrand the app:

1. **Edit `Color.kt`** — change `KmptvColors` values to match the brand palette.
2. **Edit `Theme.kt`** — update `darkColorScheme()` parameters.
3. **Keep them in sync** — `KmptvColors.Background` should match `background` in the scheme.

### Mapping brand.json to KMP theme

| Brand field        | Goes to                          | Notes                              |
|--------------------|----------------------------------|------------------------------------|
| `primary_color`    | `darkColorScheme(primary = ...)`  | CTAs, active states               |
| `accent_color`     | `KmptvColors.Accent` + `tertiary` | Focus highlights, progress bars   |
| `background_color` | Both `background` and `KmptvColors.Background` | Must be identical |
| `font_family`      | `Type.kt` font family            | Use Google Fonts or system         |

## Typography

```kotlin
val Typography = Typography(
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,
        lineHeight = 56.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    bodyMedium = TextStyle(
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    labelSmall = TextStyle(
        fontSize = 12.sp,
    ),
)
```

### TV-specific typography rules

- **Body minimum: 18sp**, but prefer 24sp for primary content. Anything smaller is unreadable from couch distance.
- **Headlines: 48-64sp.** The hero banner uses `headlineLarge`.
- **Font weight:** Bold for headings, SemiBold for row titles, Regular for body. Avoid Light/Thin — they disappear on TVs.
- **Line height: 1.3-1.4x font size.** Tight spacing hurts at 10-foot distance.

## TV-specific design decisions

### Always dark theme

TV apps default dark. The template only defines `darkColorScheme()` — no light variant. Rationale:
- TVs are viewed in dim rooms
- Bright backgrounds cause eye strain and LCD bloom
- All major streaming apps (Netflix, Prime Video, Disney+) are dark

If a brand requires light mode, you would need to add a `lightColorScheme()` and a mode toggle. This is rare for TV.

### High contrast for focus states

Focus visibility is critical at 10 feet. The template uses:
- **White border** (2dp) on focused cards via `.border(2.dp, Color.White, shape)`
- **Scale animation** (1.0 -> 1.08) on focus
- **Shadow elevation** (16dp) on focused items
- **Surface tonal elevation** change (2dp unfocused -> 8dp focused)

When rebranding, ensure:
- Focus border color contrasts >= 4.5:1 against the card background
- Scale + border together make focus obvious from across the room
- Don't rely solely on color change for focus — motion (scale) is more visible at distance

### Surface hierarchy

The template uses a 3-level dark surface system:
1. `Background` (0xFF0D0D0D) — page background
2. `SurfaceElevated` (0xFF1A1A1A) — cards, panels
3. `SurfaceFocus` (0xFF2A2A2A) — interactive elements at rest

Each level is subtly lighter than the previous. This creates depth without bright colors.

### Gradient overlays

The hero banner uses overlays for text legibility:
- Vertical gradient (transparent -> background) from middle to bottom
- Horizontal gradient (background with alpha -> transparent) on the left side

These ensure text is always readable regardless of the background image.

## Anti-patterns

- **Using Color(...) literals in composables.** Always reference `KmptvColors` or `MaterialTheme.colorScheme`. Scattered hex codes break theming.
- **Light backgrounds for TV.** Causes eye strain, LCD bloom, and looks wrong next to every other app in the launcher.
- **Thin/hairline fonts.** Invisible from 10 feet. Minimum weight 400.
- **Focus indication by color alone.** Add scale or border. Color-blind users and distance viewing both need redundant cues.
- **Separate color objects per screen.** One `KmptvColors`, one `darkColorScheme()`. Consistency comes from centralization.
