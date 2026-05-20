---
name: theming
applies_to: [phase_brand]
load_when: applying `brand.json`, or any color/typography request
---

# Theming

> Theme tokens live in `packages/shared-ui/theme/`. A brand kit becomes a theme via mechanical token replacement, then a small set of judgment calls (contrast, accent placement, dark/light defaults).

## Token structure

```
packages/shared-ui/theme/
├── tokens.ts            # The token table — single source of truth
├── ThemeProvider.tsx    # Context provider, consumed by all components
├── tokens.android.ts    # Optional per-platform override
├── tokens.ios.ts        # Optional per-platform override
└── tokens.kepler.ts     # Optional per-platform override (Vega)
```

`tokens.ts` exports a typed object roughly shaped like:

```ts
export const tokens = {
  color: {
    background: "#0B0B0F",
    surface: "#15151C",
    primary: "#E50914",
    accent: "#FFC857",
    text: "#FFFFFF",
    textMuted: "#A0A0A8",
    focusRing: "#FFFFFF",
  },
  type: {
    family: "Inter",
    size: { body: 24, h2: 36, h1: 56 },
    weight: { regular: "400", bold: "700" },
  },
  radius: { sm: 4, md: 8, lg: 16 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
};
```

## Mapping `brand.json` → tokens

| `brand.json` field | Goes into | Notes |
|--------------------|-----------|-------|
| `primary_color` | `color.primary` | Used for CTAs, active states |
| `accent_color` | `color.accent` | Used for focus rings, highlights |
| `background_color` | `color.background` | App-wide background |
| `font_family` | `type.family` | Must be loaded via `expo-font` if non-system |
| `logo_path` | Not a token — copied to `assets/logo.svg`, referenced in `Drawer` |
| `splash_path` | Not a token — copied to `apps/expo-multi-tv/assets/splash.png` |

## Decision: dark or light mode default?

TV is viewed in dim rooms much more often than phones. **Default dark unless the brief says otherwise.** Test:

- `brand_kit.background_color` lightness ≥ 0.85 → light mode is the intent.
- Otherwise → dark.

The planner's `theme.mode` field overrides this if explicitly set.

## Contrast — TV is not phone

TV viewers sit 8–10 ft away. Minimum acceptable contrast ratios are stricter than WCAG mobile baselines:

- Body text on background: **≥ 7:1** (AAA). Aim higher than you would for mobile.
- Focused vs unfocused tile border: **clearly visible from 10 ft** — usually means a bright color (white or a high-contrast accent) and a thickness of at least 4px.
- Subtitles / muted text: still ≥ 4.5:1. Don't go below.

If `brand.primary_color` fails contrast against `background_color` at body sizes, **do not** silently use it for text. Use it for CTAs and accents; use `tokens.color.text` for body.

## Focus ring color — judgment call

The template uses white as a default focus ring. This works on dark backgrounds. On lighter brands:

- Background lightness < 0.3 → focus ring = `#FFFFFF`.
- Background lightness 0.3–0.7 → focus ring = `accent_color` if it contrasts ≥ 4.5:1, else darken `accent_color`.
- Background lightness > 0.7 → focus ring = a dark neutral (e.g. `#111111`).

The contrast check is non-negotiable. A focus ring you can't see from across the room is a broken app.

## Typography

- **Body minimum: 24pt.** Anything smaller is unreadable from couch distance. The template's default `body: 24` is the floor, not a suggestion.
- **H1: 48–64pt.** H2: 32–40pt. Resist the urge to scale down.
- **Line height: 1.4× minimum.** Tight line-height hurts at distance.
- **Font weight:** prefer 400 body, 700 headings. Hairline / thin weights disappear on TVs.
- **Custom font:** if `brand.font_family` is non-system, register it via `expo-font` in the app's root layout. Verify it loads on all targets — fonts that work on iOS sometimes don't ship to Vega.

## Per-platform overrides

Reach for `tokens.ios.ts` etc. **only** when the platform genuinely needs different values. Examples that warrant an override:

- Vega's UI guidelines prescribe specific minimum tile sizes — override `spacing` there.
- Apple TV system font preference — `type.family` override.
- Fire TV banner-required color contrast — usually fine via default tokens; don't override unless tested.

If you can't articulate why the override is needed, don't add one.

## Splash and icon assets

Generate (or accept user-provided):
- **Icon:** 1024×1024 PNG, opaque, no rounding (platforms round).
- **Android TV banner:** exactly 400×240 PNG. **Required.** Builds will silently use a generic icon if missing, and look unprofessional in the leanback launcher.
- **Splash:** 1920×1080 minimum, centered logo on the brand background color.

If the brand kit only provides a logo, generate the rest:
1. Splash = logo centered on `background_color`, with 30% margin.
2. Banner = logo + wordmark on `background_color`, fitting 400×240.
3. Icon = logo on `primary_color` with 15% padding.

## Anti-patterns

- **Hardcoding colors in components.** All colors flow through `useTheme()`. If you write `color: "#fff"` in a component, you'll see it in the next bug report.
- **Using `brand.accent_color` for body text.** Accents are accents.
- **Tiny text "to fit more on screen."** Users will lean forward and squint, then close the app. 24pt or larger.
- **Multiple custom fonts.** One brand font + system fallback is enough. Two custom fonts doubles load time and font-loading failures.
