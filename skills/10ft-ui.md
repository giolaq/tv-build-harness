---
name: 10ft-ui
description: 10-foot UI design guidelines: safe zones, font sizes, contrast, focus indicators for TV viewing distance
applies_to: [phase_screens]
load_when: writing a new screen that doesn't reuse a shared-ui screen
---

# 10-foot UI

> TV is a 10-foot UI: viewer sits 8–12 ft from a 1080p–4K screen. Decisions that are fine on phone (12pt text, 4:1 contrast, dense layouts) are broken on TV. This skill is the checklist for new screens that don't reuse the template's vetted ones.

If you're reusing `Home`, `Detail`, etc., **you don't need this skill** — they already comply. Load this only when generating something genuinely new.

## The numbers

| Spec | TV minimum | Phone minimum (for contrast) |
|------|------------|------------------------------|
| Body text size | 24pt | 14pt |
| Heading 1 | 48–64pt | 24–28pt |
| Line height | 1.4× font size | 1.2× |
| Touch / focus target | 96×96pt | 44×44pt |
| Body text contrast | 7:1 (AAA) | 4.5:1 (AA) |
| Focus ring thickness | 4px+ | n/a |
| Safe area margin | 5% of width/height each edge (overscan) | n/a |

The phone column is there to make the deltas obvious. On TV, everything is bigger, thicker, more contrasted.

## Overscan / safe area

TVs historically cropped 5% of the image edges. Modern flatscreens mostly don't, but the convention persists, and the platforms (especially Apple TV) enforce safe areas in their HIG. Practical rules:

- Don't put critical content within 5% of any edge.
- Don't anchor focus rings exactly to the edge — they'll get clipped on some screens.
- Use `useSafeAreaInsets()` (from `react-native-safe-area-context`) and offset all root containers.

The template's screen wrappers handle this. For a brand-new screen, replicate that pattern — don't put a `<View>` at `top: 0` and call it done.

## Focus is everything

A 10-ft UI is navigated by D-pad, not by pointing. Every interactive element must:

1. Be focusable (`<SpatialNavigationFocusableView>` or themed `<Pressable>`).
2. Have a visible focus state (focus ring, scale, glow — at least one, clearly visible at 10 ft).
3. Be reachable from at least one direction (no orphans).

If you can't D-pad to it, it doesn't exist.

See `spatial-navigation.md` for the focus tree primitives. This skill is about *visual* focus, not the focus tree.

## Layout density

Phone designers cram. TV designers don't.

- **Cards (tiles):** target 240–320px wide, 360–480px tall (16:9 thumbnail + label). Smaller → unreadable. Bigger → too few per row.
- **Rails:** 5–7 visible tiles per row on a 1080p layout. More = each tile becomes a postage stamp.
- **Grids:** 4–6 columns on 1080p. Same logic.
- **Whitespace:** generous. The user is 10 ft away, not 12 inches. Cramming reads as noise.

When in doubt, fewer-larger over more-smaller.

## Typography for TV

- **Font:** sans-serif. Serifs blur at distance. The template defaults to a clean sans; respect that.
- **Weight:** 400 for body, 700 for headings. Thin / hairline disappears.
- **Tracking:** very slight positive tracking helps legibility (1–2% letter-spacing). Not required, but improves polish.
- **Multiple lines:** avoid stacking more than 3 lines of body text without a break. Long-form reading on TV is a known failure mode.

## Color and contrast

Lower-quality TVs and bright rooms compress contrast. Account for the worst case:

- **Body text on background:** 7:1 minimum. If your brand says white on dark gray, check the actual ratio. `#FFFFFF on #1F1F1F` = 13:1, fine. `#CCCCCC on #1F1F1F` = 9.2:1, also fine. `#888888 on #1F1F1F` = 4.5:1, **not** fine for body.
- **Muted / secondary text:** 4.5:1 minimum. Below this it's invisible.
- **Focus ring vs background:** if the focus ring is 4px and high-contrast, it works. If you've themed it to a brand color that's too close to background, fix it (see `theming.md` focus ring decision rule).

## Motion

Motion is great on TV — large screens, dramatic feel — but with rules:

- **Focus transitions:** 150–250ms, ease-out. Faster feels jittery, slower feels sluggish.
- **Screen transitions:** 250–400ms.
- **Hero crossfades:** 300–500ms.
- **Avoid parallax / scroll-jacking** for the primary navigation. D-pad expects predictable, snap-style focus moves.

Animations that work on phone (subtle bounce, slide-in-from-bottom) often feel cheap on TV. Bigger, calmer motion reads better.

## Empty states

A screen with no content is a real possibility (empty watchlist, search with no results, category with no items). Don't let it render blank:

- Show a clear illustration or large icon.
- Headline at H2 size.
- One-sentence explanation.
- A CTA back to a populated screen ("Browse home", "Search").

This is the difference between "looks broken" and "looks intentional."

## Accessibility — non-optional even on TV

- **Captions / subtitles:** if content has them, they must be available (see `video-player.md`).
- **Screen reader:** Apple TV has VoiceOver; Android TV has TalkBack. Set `accessibilityLabel` on focusables. The template's components do this — preserve it when extending.
- **Reduced motion:** respect the system setting on Apple TV; gracefully skip non-essential animations.
- **Contrast:** see above; already covered.

## Decision tree: I need a new screen layout

1. **Can I describe it as one of `Home`, `Category`, `Detail`, `Player`, `Search`, `Settings`?** → Use that screen with different data. Stop.
2. **Is it a variation of one of those?** → Copy the closest screen as a starting file. Modify carefully. Keep its `SpatialNavigationRoot`, safe area, focus model.
3. **Is it genuinely new (live TV, profiles, browse-by-mood, etc.)?** → Apply this skill from scratch. Specifically:
   - Wrap in `<SpatialNavigationRoot>` + safe-area-aware container.
   - Use theme tokens for every color, size, spacing.
   - Compose from `Hero`, `Rail`, `Grid`, `Tile` where possible.
   - Run `run_focus_check` before considering it done.
   - Add an empty state.

## Anti-patterns

- **Small text "to fit more on screen".** Less content visible is better than unreadable content.
- **Hover states.** TV has no hover. Use focus states.
- **Mouse-sized buttons (44pt).** Too small. 96pt+ visible targets.
- **Edge-anchored content.** Overscan eats it. Use safe-area insets.
- **High-density grids (8+ columns).** Tiles become postage stamps.
- **Long forms with virtual keyboard.** TV text entry is painful. Minimize fields; offer voice / phone-handoff if the platform supports it.
- **Dense data tables.** TV is not a spreadsheet medium. Re-shape to lists, cards, or summary screens.
