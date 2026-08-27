---
name: color-bleed-focus-tv
applies_to: [creative_ui]
meta:
  created_by_run: e861001d
  created_at: 2026-07-15
  times_loaded: 0
  times_defect_recurred: 0
---

# Color Bleed Focus Pattern for TV Cards

## Problem

Standard TV card focus states use a contained border + shadow that stays within the card bounds. This looks generic — every template app has the same rectangular glow. The "color bleed" effect makes the accent color appear to leak outward beyond the card boundary like neon paint, creating a distinctive, premium look.

## Fix Pattern

```typescript
// BEFORE (generic — contained border glow)
cardFocused: {
  borderColor: accentColor,
  borderWidth: scaledPixels(4),
  transform: [{ scale: 1.06 }],
  shadowColor: accentColor,
  shadowOpacity: 0.6,
  shadowRadius: scaledPixels(16),  // Too small — contained
  elevation: 10,
}

// AFTER (color bleed — paint bleeding beyond boundaries)
cardFocused: {
  borderColor: 'rgba(primaryColor, 0.85)',        // Inner warm ring
  borderWidth: scaledPixels(4),
  transform: [{ scale: 1.06 }],
  shadowColor: 'rgba(accentColor, 0.45)',         // Bleed color — distinct from border
  shadowOffset: { width: 0, height: 0 },         // Centered glow
  shadowOpacity: 1.0,                             // Full opacity — the rgba handles transparency
  shadowRadius: scaledPixels(32),                 // LARGE radius — this is the bleed
  elevation: 20,
}
```

The key insight: use TWO different colors. The `borderColor` is a warm inner ring (primary brand color at high opacity). The `shadowColor` is the accent color at mid-opacity and a very large radius, creating the illusion of color bleeding outward beyond the card.

## Critical Requirements

1. **`overflow: 'visible'`** on the card container — without this, React Native clips the shadow and the bleed is invisible. This is the #1 reason the effect fails silently.

2. **Sufficient parent container height** — the parent View wrapping the rail/row must have enough height to not clip the scaled card + bleed. If cards are 260px and scale to 1.06x, the parent needs ~320px+ to not clip.

3. **shadowOpacity: 1.0 with rgba color** — don't use shadowOpacity < 1 combined with rgba transparency; they multiply and the result is invisible. Pick one: either full opacity with an rgba color, or opaque hex color with reduced shadowOpacity.

## Double-ring variant (outer BORDER, not just shadow)

A concentric double-ring focus (inner solid accent + outer accent@30% with a gap)
is a strong signature. But an outer *border* ring cannot live on the same View as
the card's `overflow: 'hidden'` (used to clip the image to a radius) — the card
clips its own outer ring away. A larger shadowRadius alone is not a crisp ring.

The fix is a THREE-layer structure: a non-clipping wrapper owns the scale + glow
and hosts the outer ring as an absolutely-positioned sibling with negative insets;
the inner (clipped) card keeps only the solid inner border.

```typescript
// Wrapper: NO overflow:hidden. Carries scale + shadow.
<View style={[styles.cardWrapper, isFocused && styles.cardWrapperFocused]}>
  {isFocused && (
    // Outer ring: negative insets push it OUTSIDE the card, past the gap.
    <View pointerEvents="none" style={{
      position: 'absolute', top: -11, left: -11, right: -11, bottom: -11,
      borderWidth: 3, borderColor: 'rgba(accent,0.30)',
      borderRadius: cardRadius + 11,   // radius must grow with the offset
    }} />
  )}
  {/* Inner card KEEPS overflow:hidden for the image, keeps the solid border */}
  <View style={[styles.card, isFocused && { borderColor: accent }]}>
    <Image .../>
  </View>
</View>
```

Move the `transform: [{ scale }]` to the WRAPPER, not the card, so ring + card
scale together. `outerRadius = innerRadius + gap + strokeWidth` or the corners
won't be concentric.

## Gotchas

- **Android `elevation` interacts differently** — elevation creates its own shadow shape on Android; the color bleed is primarily visible on iOS/tvOS and web. Keep `elevation: 20` for Android's approximation.
- **Don't apply `overflow: 'hidden'` for image clipping on the same View** — if you need image rounding, use a nested View with overflow:hidden inside the outer overflow:visible container, or apply `borderRadius` to the Image directly.
- **Pair with a specular highlight** — a 1px semi-transparent white borderTop on the focused card reinforces the "lifted toward viewer" illusion that makes the bleed look physically motivated rather than arbitrary.
- **Warm idle tint removal** — cards should have a subtle warm overlay when unfocused (deepens the atmospheric feel) that disappears on focus, making the focused card appear "lit up" by contrast.
