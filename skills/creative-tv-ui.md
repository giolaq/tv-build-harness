---
name: creative-tv-ui
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

TV design is NOT web design zoomed in. At 10 feet, users perceive:
- **Shapes and color blocks** before text
- **Motion** more sensitively (peripheral vision is active)
- **Contrast** as the primary hierarchy tool (not size alone)
- **Glow and light** as premium indicators (dark rooms amplify luminance)

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
