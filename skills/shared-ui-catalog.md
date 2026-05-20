---
name: shared-ui-catalog
applies_to: [phase_screens, phase_navigation]
load_when: planner specifies a screen, or `add_screen` / `remove_screen` is invoked
---

# Shared UI catalog

> The template ships a working app. **Reuse before generating.** Free-form code is a last resort, not a first move. Every component in this catalog is battle-tested for TV focus, performance, and platform splits.

## The rule

For every screen the planner requests:

1. Find the closest existing screen in `packages/shared-ui/screens/`. **Use it as-is** if the difference is just data binding.
2. If the layout matches but composition differs, **compose existing components** into a new screen file.
3. Only if neither (1) nor (2) applies, write a new screen — and then look at existing screens for patterns before starting.

If you find yourself writing a `<View>` with a `<FlatList>` from scratch, stop. The template has `Grid`. Use it.

## Component reference

### `<Drawer>`
**Purpose:** Left-side collapsible navigation. Hosts the app's primary routes.
**When to use:** Always. It is the app's chrome. Don't replace it unless the planner explicitly says `navigation.type !== "drawer"`.
**Customize:** Items via `navigation/routes.ts`; theme tokens for background, accent, focused-item style.
**Do not:** Reimplement as tabs. If the planner asks for tabs, swap the navigator at the navigation layer, don't fork the drawer.

### `<Hero>`
**Purpose:** Top-of-screen dynamic banner. Updates as the user focuses tiles in the row below.
**When to use:** Any "browse" screen with a featured item. Home, category landing.
**Inputs:** `focusedItem` (auto-wired by parent), image URL, title, description, CTA.
**Gotcha:** Updates on focus change — too many state writes can drop frames. The component already debounces; don't add another debounce on top.

### `<Grid>`
**Purpose:** Responsive grid of tiles. Handles focus, virtualization, edge wrapping.
**When to use:** Any catalog view — categories, search results, watchlist.
**Inputs:** `items`, `renderItem` (optional; defaults to `<Tile>`), `columns` (auto by screen size).
**Gotcha:** Pass stable `keyExtractor`. Without it, focus jumps on re-render. The template defaults to `item.id`; if your manifest uses a different key, supply one.

### `<Rail>`
**Purpose:** Horizontal scrolling row of tiles (Netflix-style).
**When to use:** Home-page sections, "more like this" recommendations.
**Inputs:** `title`, `items`, `onItemFocus` (often used to drive the parent `<Hero>`).
**Gotcha:** Focus restoration on return — the template handles this via `<TVFocusGuide>` internally. Don't wrap it in another guide.

### `<Tile>`
**Purpose:** Single content card. Thumbnail, title, focus ring.
**When to use:** Inside Grid or Rail. Rarely standalone.
**Customize via theme:** Focus border color, scale-on-focus amount, label visibility.
**Anti-pattern:** Building your own card. The focus behavior here is non-trivial; don't recreate it.

### `<Player>`
**Purpose:** Full-screen video player based on `react-native-video`.
**When to use:** The player screen. That's it.
**Inputs:** `source` (URL + type), `metadata` (title, etc.), `onClose`.
**Customize:** Controls overlay, scrub-bar style. Player core logic — don't.
**Platform notes:** Vega has its own player. See `video-player.md`.

### `<DetailHeader>`, `<EpisodeList>`, `<RelatedRail>`
**Purpose:** Composable pieces of the detail screen.
**When to use:** Building detail variants (movie vs series vs live).

## Existing screens

| Screen | File | What it does | Reuse if… |
|--------|------|--------------|-----------|
| Home | `screens/Home/` | Hero + multiple rails driven by manifest sections | Manifest has `featured` + `categories` with `items` |
| Category | `screens/Category/` | Grid of items for one category | Drill-down from drawer/home |
| Detail | `screens/Detail/` | Hero + metadata + episodes/related + Play CTA | A video is selected |
| Player | `screens/Player/` | Full-screen `<Player>` + overlays | Detail's Play is pressed |
| Search | `screens/Search/` | Text input + grid results | Catalog is large enough that a search is useful |
| Settings | `screens/Settings/` | About, theme toggle, sign-out | Standard housekeeping |

## Decision tree: which screen do I add?

**Planner says `layout: "hero+rails"`** → use existing `Home`. Pass different data via the route param.
**Planner says `layout: "grid"`** → use existing `Category`. Provide a category ID.
**Planner says `layout: "detail"`** → use existing `Detail`. Provide an item ID.
**Planner says `layout: "player"`** → use existing `Player`. Always.
**Planner says `layout: "search"`** → use existing `Search`.
**Planner says `layout: "settings"`** → use existing `Settings`.

**None of the above** → write a new screen by composing components. Start by copying the closest existing screen as scaffolding.

## When to write a new component

Bar is high. New component only if:

- The visual pattern appears in **at least two screens** in the AppSpec.
- It can't be achieved by composing existing components.
- It has non-trivial focus behavior that warrants encapsulation.

Otherwise: inline it in the screen, and let it earn promotion to a component on the next iteration when it gets reused.

## Anti-patterns

- **Reimplementing the drawer as a custom sidebar.** Always loses focus edge cases.
- **Wrapping `<Rail>` or `<Grid>` in your own `<TVFocusGuide>`.** They already use one. Nested guides trap focus.
- **Custom `<Tile>` with `<TouchableOpacity>`.** Use `<Pressable>` so the template's focus styles work; better yet, use `<Tile>`.
- **Adding a fourth navigation pattern (e.g. bottom tabs on TV).** Bottom tabs don't work with D-pad. If the planner emits this, override and ask.
