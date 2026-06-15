---
name: creative-tv-ui
applies_to: [creative_ui]
---

# Creative TV UI Design Patterns

## The 10-Foot Creative Challenge

TV design is NOT web design zoomed in. At 10 feet, users perceive:
- **Shapes and color blocks** before text
- **Motion** more sensitively (peripheral vision is active)
- **Contrast** as the primary hierarchy tool (not size alone)
- **Glow and light** as premium indicators (dark rooms amplify luminance)

## Typography for TV

### Display Fonts (Hero titles, numbers)
Choose fonts with HIGH x-height and BOLD weight. Condensed fonts work exceptionally well on TV because they allow large point sizes without wrapping:

Best categories:
- **Condensed Sans-Serif**: Barlow Condensed, Oswald, Archivo Narrow — maximum impact per pixel
- **Heavy Grotesque**: Montserrat Black, Inter Black (900 weight only), Bebas Neue
- **Slab Serif**: Roboto Slab Bold, Bitter Bold — editorial authority
- **Display**: Playfair Display Bold for luxury/editorial contexts

### Body Fonts (Descriptions, metadata)
Must be:
- Regular or Medium weight (never Light on TV — low contrast kills it)
- Minimum scaledPixels(24) for body, scaledPixels(18) for captions
- High x-height for readability at distance

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

TV apps almost always use dark themes (living room, low ambient light). Flat black is BORING. Add depth:

### Surface Hierarchy
```
background:    #0A0A0F  (deepest)
surface-1:     #12121A  (cards, containers)
surface-2:     #1A1A24  (elevated cards, modals)
surface-3:     #22222E  (active/focused backgrounds)
```

### Glow & Light Effects
The accent color should feel like a LIGHT SOURCE, not just a tint:
```typescript
focusGlow: {
  shadowColor: accentColor,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.7,
  shadowRadius: scaledPixels(20),
}
```

### Color Application Rules
- Primary color: used sparingly for key CTAs, badges, and indicators
- Accent color: used for focus states, active elements, and highlights
- Background tints: mix accent at 5-10% opacity for atmospheric depth
- Text on dark: use #FFFFFF for primary text, 70% white for secondary, 40% white for disabled

## Focus States: The Hero Element

The focus indicator is the single most-seen UI element on TV. It deserves the most design attention.

### Layered Focus Pattern
```typescript
const cardFocused = {
  // Layer 1: Scale (size dominance)
  transform: [{ scale: 1.08 }],
  // Layer 2: Border (crisp definition)
  borderWidth: scaledPixels(4),
  borderColor: accentColor,
  // Layer 3: Glow (atmospheric light)
  shadowColor: accentColor,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.8,
  shadowRadius: scaledPixels(24),
  elevation: 20,
  // Layer 4: Surface lift (subtle background change)
  backgroundColor: 'rgba(255,255,255,0.05)',
};
```

### Focus Timing
If using react-native-reanimated:
- Scale: spring({ damping: 15, stiffness: 150 }) — bouncy but controlled
- Opacity: timing({ duration: 200, easing: Easing.out(Easing.cubic) })
- Shadow: timing({ duration: 300 }) — slightly slower for glow spread

## Animation Guidelines for TV

### DO:
- Use transform (scale, translateX/Y) — GPU composited, no layout cost
- Use opacity transitions — smooth and performant
- Use spring curves for focus changes — feels physical
- Stagger list item reveals by 50-100ms per item

### DON'T:
- Animate width/height (triggers layout)
- Use infinite loops or continuous motion (distracting in living room)
- Add motion that competes with content (video thumbnails are already visual)
- Create animations longer than 500ms (TV interactions must feel responsive)

## Anti-Patterns (What Looks Bad on TV)

1. **Thin borders (1-2px)**: Invisible at 10ft. Minimum 4px for borders.
2. **Subtle shadows**: Box-shadows need to be BOLD (radius 16px+, opacity 0.5+)
3. **Low-contrast text**: Anything below 4.5:1 disappears on TV
4. **Small icons**: Minimum 24x24px rendered size, prefer 32px+
5. **Flat design without depth**: On a big dark screen, flat elements look like floating paper cutouts. Add depth via shadows, gradients, and surface hierarchy.
6. **Over-rounded corners**: radius > 16px on small elements looks childish. Match radius to element size (8px for small, 12px for medium, 16-24px for large)
7. **Evenly-distributed color**: One dominant + one accent > three equally-weighted colors

## Atmospheric Backgrounds

### Gradient Mesh (simple version for RN)
```typescript
// Vertical gradient: dark top to slightly lighter bottom
<LinearGradient
  colors={['rgba(10,10,15,1)', 'rgba(20,20,30,1)']}
  style={StyleSheet.absoluteFill}
/>
```

### Radial Spotlight (behind hero)
```typescript
// Accent-tinted radial from center-top
<RadialGradient
  colors={[`${accentColor}15`, 'transparent']}
  center={[0.5, 0.2]}
  radius={0.6}
  style={StyleSheet.absoluteFill}
/>
```

### Surface Tinting
Add the accent color at very low opacity (3-8%) to surface backgrounds:
```typescript
surface: `${accentColor}08`  // accent at 3% opacity
surfaceHover: `${accentColor}12`  // accent at 7% opacity
```
