---
name: creative-tv-ui
description: "Creative visual design patterns for TV apps: typography, color depth, focus states, animations, per-content-type personalities"
applies_to: [creative_ui]
---

# Creative TV UI Design Patterns

## The Differentiation Imperative

Every generated app MUST look different from every other. The template provides structure — your job is to give it SOUL. A viewer should never think "this looks like that other app." Visual diversity comes from:

1. **Visual signature** — one distinctive element unique to this app
2. **Typography personality** — fonts that match the content's energy
3. **Color depth** — not just flat colors but atmospheric gradients and glows
4. **Focus treatment** — the signature interaction moment
5. **Surface hierarchy** — cards and sections that feel 3D, not flat

## The 10-Foot Creative Challenge

TV design is NOT web design zoomed in. At 10 feet (3 meters — the standard viewing distance), users perceive:
- **Shapes and color blocks** before text
- **Motion** more sensitively (peripheral vision is active)
- **Contrast** as the primary hierarchy tool (not size alone)
- **Glow and light** as premium indicators (dark rooms amplify luminance)

### TV Panel Color Physics

TV panels render colors MORE saturated and vibrant than computer screens. The color gamut is narrower, contrast is higher. This means:
- **Desaturate warm colors** — pure red/orange/yellow will appear garish on TV. Pull saturation down 10-20% from what looks good on your monitor.
- **Cool tones are safer** — blue, purple, gray render more predictably across TV panels.
- **Warm tones still work** for cooking/lifestyle apps but use them at lower saturation (e.g., `#D4A574` not `#FFAA00`).
- **Never use pure white (#FFFFFF)** for large text areas — use off-white (`#F5F5F5` or `#EBEBEB`) to reduce glare in dark rooms.
- **Test accent colors at 50% opacity** — if they're still visible and distinctive, the saturation is correct for TV.

### Interaction Cost Shapes Design

D-pad navigation is sequential — users pass through ALL elements on the path. This constrains creative layout:
- **Max 5-7 items visible per rail** — more items = more clicks to reach the last one
- **Prefer fewer, larger cards** over many small ones — reduces traversal cost
- **Hero sections earn their space** — they reduce the total items a user must navigate past
- **Vertical sections: max 4-5 rails visible** before requiring scroll — users should reach any visible content in ≤3 presses

## Visual Personality by Content Type

### Sports / Live Events
- Angular geometry: diagonal cuts on cards, skewed section dividers
- High-energy colors: saturated red/orange accents, electric blue highlights
- Stadium typography: condensed heavy weights (Oswald, Barlow Condensed)
- Scoreboard elements: ticker-style metadata, stats badges, live indicators
- Motion: fast snappy transitions, no ease — linear or ease-out only

### Cooking / Food / Lifestyle
- Organic warmth: golden-hour gradients, warm amber undertones
- Rounded shapes: large border radius (16-24px), soft edges everywhere
- Editorial typography: Playfair Display for headings, friendly body fonts
- Texture: subtle paper/linen-like surface colors, not pure black
- Motion: gentle easing, slightly slower transitions (250-350ms)

### Music / Entertainment / Nightlife
- Neon depth: glow effects that bleed beyond card boundaries
- Glass-morphism: translucent cards with backdrop blur effect
- Bold typography: Bebas Neue, Space Grotesk at extreme weights
- Gradient-rich: multi-stop gradients in backgrounds, even on text (via gradient overlays)
- Motion: spring animations with overshoot, bouncy focus

### Fitness / Health / Wellness
- Athletic precision: sharp edges, geometric consistency, grid alignment
- Clean power: high contrast, bold accent colors on near-black
- Technical typography: monospace for stats, condensed for titles
- Progress elements: accent-colored lines/bars as section dividers
- Motion: fast, precise, no bounce — ease-out with short duration (150-200ms)

### Kids / Animation / Family
- Oversized playful: larger border radius, thicker borders (6-8px)
- Candy colors: gradient fills on cards, not flat — cheerful multicolor
- Rounded friendly type: Nunito, Baloo, Fredoka at heavy weights
- Bouncy elements: oversized focus scale (1.12-1.15), playful shadows
- Motion: spring with high overshoot, slightly exaggerated

### Documentary / News / Educational
- Editorial authority: serif display fonts, strong typographic hierarchy
- Paper weight: surface colors that reference paper/parchment depth
- Minimal decoration: let content breathe, use whitespace as design element
- Accent restraint: one accent used very sparingly (headlines, key indicators only)
- Motion: subtle, almost invisible — refined and professional

## Typography for TV

### Display Fonts (Hero titles, numbers)
Choose fonts with HIGH x-height and BOLD weight. Condensed fonts work exceptionally well on TV because they allow large point sizes without wrapping:

Best categories:
- **Condensed Sans-Serif**: Barlow Condensed, Oswald, Archivo Narrow
- **Heavy Grotesque**: Montserrat Black, Bebas Neue, Archivo Black
- **Slab Serif**: Roboto Slab Bold, Bitter Bold
- **Display**: Playfair Display Bold, DM Serif Display

### Body Fonts (Descriptions, metadata)
Must be:
- Regular or Medium weight (never Light on TV)
- Minimum scaledPixels(24) for body, scaledPixels(18) for captions
- High x-height for readability at distance

Good body fonts: DM Sans, Nunito Sans, Source Sans Pro, Lato, Inter (400-500 weight only)

### Type Scale Pattern
```typescript
const typography = {
  display:  { fontSize: scaledPixels(72), fontWeight: '800', letterSpacing: -1 },
  heading:  { fontSize: scaledPixels(44), fontWeight: '700', letterSpacing: 0 },
  title:    { fontSize: scaledPixels(32), fontWeight: '600', letterSpacing: 0.2 },
  body:     { fontSize: scaledPixels(26), fontWeight: '400', lineHeight: scaledPixels(36) },
  caption:  { fontSize: scaledPixels(20), fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
};
```

## Color Depth for Dark Themes

TV apps almost always use dark themes. Flat black is BORING. Add depth:

### Surface Hierarchy (REQUIRED — do not use flat backgrounds)
```
background:    #0A0A0F  (deepest)
surface-1:     #12121A  (cards, containers)
surface-2:     #1A1A24  (elevated cards, modals)
surface-3:     #22222E  (active/focused backgrounds)
```

Derive these from the brand's background color — not hardcoded. Add 5%, 10%, 15% white to the background.

### Atmospheric Color (what makes apps feel different)
```typescript
// Warm app (cooking/lifestyle):
atmosphere: 'rgba(255, 180, 60, 0.04)'   // golden warmth everywhere

// Cool app (tech/sports):
atmosphere: 'rgba(60, 130, 255, 0.04)'   // ice-blue undertone

// Electric app (music/entertainment):
atmosphere: 'rgba(180, 60, 255, 0.05)'   // neon purple haze

// Natural app (documentary/nature):
atmosphere: 'rgba(60, 180, 100, 0.03)'   // forest green whisper
```

Apply the atmosphere color as a full-screen overlay or gradient tint on backgrounds.

### Glow & Light Effects
The accent color should feel like a LIGHT SOURCE:
```typescript
focusGlow: {
  shadowColor: accentColor,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.7,
  shadowRadius: scaledPixels(20),
  elevation: 20,
}
```

## Cinematic Scrim System (Hero Sections)

Every hero/featured section MUST have a scrim — a gradient overlay between the background image and foreground text. This is the single most important readability pattern in TV UI. Android TV documents it as a required architectural element.

### Scrim Anatomy
```
┌─────────────────────────────────────┐
│  Background Image (full-bleed)      │
│  ┌───────────────────────────────┐  │
│  │  Cinematic Scrim (gradient)   │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  Poster + Title + CTA   │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Two Variants

**Immersive Hero** (full-bleed, Netflix/Disney+ style):
```typescript
const cinematicScrim = {
  position: 'absolute',
  bottom: 0, left: 0, right: 0,
  height: '70%',
  // Gradient from transparent at top to near-opaque at bottom
  // Use LinearGradient: ['transparent', 'rgba(bg, 0.6)', 'rgba(bg, 0.95)']
};
```

**Card Hero** (contained within a card shape):
```typescript
const cardScrim = {
  position: 'absolute',
  bottom: 0, left: 0, right: 0,
  height: '50%',
  borderBottomLeftRadius: cardBorderRadius,
  borderBottomRightRadius: cardBorderRadius,
  // Gradient: ['transparent', 'rgba(0,0,0,0.8)']
};
```

### Rules
- NEVER place text directly on a background image without a scrim
- The scrim gradient must be strong enough for 4.5:1 contrast ratio
- Background images should NOT contain embedded text (use overlaid components instead)
- Scrim color should match the app's background color (not always pure black)

## Focus States: The Signature Element

The focus indicator is the single most-seen UI element on TV. It MUST be distinctive.

### Layered Focus Pattern (baseline — all apps need at least this)
```typescript
const cardFocused = {
  transform: [{ scale: 1.08 }],
  borderWidth: scaledPixels(4),
  borderColor: accentColor,
  shadowColor: accentColor,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.8,
  shadowRadius: scaledPixels(24),
  elevation: 20,
};
```

### Specular Highlight Focus (Apple-quality premium feel)

Apple tvOS adds a specular highlight — a simulated light reflection that moves across the focused element. Approximate this with a positioned semi-transparent gradient overlay:

```typescript
const specularHighlight = {
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: '40%',
  borderTopLeftRadius: cardBorderRadius,
  borderTopRightRadius: cardBorderRadius,
  backgroundColor: 'transparent',
  // Simulate light hitting the top edge of the elevated card
  borderTopWidth: 1,
  borderTopColor: 'rgba(255, 255, 255, 0.15)',
};
```

Only show the specular highlight when focused — it reinforces that the card has "lifted" toward the viewer. Combine with scale + shadow for the full effect: scale lifts, shadow grounds, specular catches light.

### Focus-Driven Environment (Netflix/Disney+ level)

Production apps don't just highlight the focused card — they change the SURROUNDING environment:

- **Background image updates**: When a card receives focus, the screen's background image crossfades to that item's hero art (or a blurred/darkened version of it).
- **Metadata reveal**: The focused card's row expands in height to reveal title + description below the card, then contracts when focus moves away.
- **Color extraction**: The ambient/atmospheric tint adapts to the dominant color of the focused item's artwork.

Implementation pattern:
```typescript
// In the rail/row component, track which item is focused:
const [focusedIndex, setFocusedIndex] = useState(0);
const focusedItem = items[focusedIndex];

// Pass focusedItem to a parent context or screen-level component
// that renders the background and metadata area
```

This is the single biggest differentiator between "template" and "production" TV UI. Even a simple version (background color tint changes on focus) elevates the experience dramatically.

### Going Further — Per-Personality Focus
- Sports: add a small accent-colored bar at the top of the focused card
- Cooking: use a warm double-glow (inner gold + outer accent)
- Music: extreme glow radius (32px+), glow color slightly different from border
- Fitness: razor-sharp single-color border (no glow, no shadow — just precision)
- Kids: larger scale (1.12), rounder corners on focus, thicker border (6px)

## Animation Guidelines for TV

### DO:
- Use transform (scale, translateX/Y) — GPU composited, no layout cost
- Use opacity transitions — smooth and performant
- Use spring curves for focus changes — feels physical
- Stagger list item reveals by 50-100ms per item

### DON'T:
- Animate width/height (triggers layout)
- Use infinite loops or continuous motion
- Add motion that competes with video content
- Create animations longer than 500ms
- Add new event listeners or keyboard handlers

## Navigation Drawer: Dual-State Pattern

TV navigation drawers are fundamentally different from mobile. They have TWO always-visible states:

### Collapsed State (icon rail)
When focus is on content, the drawer collapses to a narrow rail showing only icons:
```typescript
const collapsedDrawer = {
  width: scaledPixels(72),           // Just enough for icon + padding
  backgroundColor: surfaceColor,
  paddingVertical: scaledPixels(24),
};

const collapsedItem = {
  width: scaledPixels(72),
  height: scaledPixels(56),
  alignItems: 'center',
  justifyContent: 'center',
};
```

### Expanded State (icons + labels)
When focus moves to the drawer, it expands to show full labels:
```typescript
const expandedDrawer = {
  width: scaledPixels(280),
  backgroundColor: surfaceColor,
};

const expandedItem = {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: scaledPixels(20),
  height: scaledPixels(56),
  gap: scaledPixels(16),
};
```

### Behavioral Models

**Standard drawer** (Netflix, Prime Video): Content pushes aside when drawer expands. Moving focus between nav items auto-updates the page content (focus-triggers-navigation). Best for apps where users browse between sections frequently.

**Modal drawer** (less common): Overlays content with a semi-transparent scrim. Requires explicit selection (press Enter/Select) to navigate. Better when the drawer is rarely used or has many items.

Choose Standard for content-browsing apps (streaming, media). Choose Modal for utility-heavy apps (settings-focused, deep hierarchies).

## Anti-Patterns (What Makes Apps Look Generic)

1. **Same font everywhere** — Using one system font makes all apps identical
2. **Flat solid backgrounds** — No depth perception on a big dark screen
3. **Identical focus states** — border+scale with no glow = template
4. **No atmospheric color** — Pure gray surfaces have no personality
5. **Identical card shapes** — Every app has the same 8px rounded rectangle
6. **No visual accent beyond color** — Just changing hex values isn't designing
7. **Same section spacing** — Every section starts the same distance apart
8. **No decorative elements** — Lines, shapes, and geometric accents add character

## Implementation Checklist

After creative_ui phase, the app MUST have:
- [ ] Two distinct fonts loaded (display + body)
- [ ] Focus glow using shadowColor/shadowOpacity/shadowRadius
- [ ] At least one atmospheric/decorative component added to screens
- [ ] Surface hierarchy (cards are NOT the same color as background)
- [ ] Section titles styled differently from body text (font, size, spacing)
- [ ] At least one visual element that no other app would have
- [ ] Cinematic scrim on any hero/featured section with background imagery
- [ ] Accent colors desaturated for TV panel rendering (not monitor-bright)
- [ ] No more than 6-7 items visible per horizontal rail
- [ ] Specular highlight OR environment-reactive focus (pick at least one advanced focus pattern)
