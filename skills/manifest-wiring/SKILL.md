---
name: manifest-wiring
description: "Content manifest wiring: how to connect content.json data to React Native data hooks and screen components"
applies_to: [phase_manifest, phase_screens]
load_when: injecting `content.json`, or wiring data into screens
---

# Manifest wiring

> Content flows: `content.json` → typed parse → hooks → screens. The template ships hooks for the default shape. The agent's job is matching the user's manifest to those hooks, or generating new hooks when the shape diverges.

## Where the manifest lives

```
packages/shared-ui/data/
├── content.json          # The user's manifest (overwrite on inject)
├── content.schema.ts     # Type definitions
└── seed.json             # Original template seed — keep as fallback example
```

`inject_content` copies the user's manifest to `content.json` and validates against `content.schema.ts`. **Validate before screens get wired,** not after.

## Default manifest shape

```ts
type Manifest = {
  title: string;
  description: string;
  categories: { id: string; name: string; items: string[] }[];   // items = video IDs
  videos: Video[];
  featured: string[];     // video IDs to put in the hero
};

type Video = {
  id: string;
  title: string;
  description: string;
  duration_sec: number;
  thumbnail_url: string;
  stream_url: string;
  stream_type: "hls" | "dash" | "mp4";
  tags?: string[];
};
```

## Existing data hooks

| Hook | Returns | Used by |
|------|---------|---------|
| `useFeatured()` | `Video[]` | Home hero |
| `useCategories()` | `Category[]` | Home rails, drawer items |
| `useCategory(id)` | `Video[]` | Category grid screen |
| `useVideo(id)` | `Video` | Detail, Player screens |
| `useSearch(q)` | `Video[]` | Search screen |
| `useRelated(id)` | `Video[]` | Detail "related" rail |

These hooks read directly from `content.json`. Swap the underlying source for an API later — same signature.

## Decision tree: does the user's manifest match the default shape?

**Exact match.** Just inject and move on. The screens are already wired.

**Match with extra fields** (e.g. user has `cast`, `year`, `rating`). Inject the manifest, and:
- If the AppSpec references those fields on a screen, surface them via a small extension to the type and screen.
- If not, leave them unused. Don't strip them — future iterations may need them.

**Different shape but mappable.** Add a translation step in `inject_content`:
- Write a `transformManifest()` function that maps the user's shape to the template's shape.
- Save the original under `data/source.json` for debugging.
- Output the translated `content.json`.
- Note the mapping in the run log.

**Fundamentally different model** (e.g. live TV channels with EPG, not VOD videos). The template's hooks won't fit:
- Generate new hooks (`useChannels`, `useNowPlaying`, `useEPG`) instead of forcing the data into the VOD shape.
- Generate new screens to consume them (and add a new screen skill for next time).
- The drawer/navigation still applies.

## Validation rules to enforce at inject time

These catch ~80% of "the app rendered blank" bugs:

1. **Every ID referenced in `categories[].items` and `featured` exists in `videos`.** Missing = silent empty screens.
2. **No duplicate IDs.** Breaks focus restoration and analytics.
3. **All `thumbnail_url` and `stream_url` parse as URLs.** Relative paths break on TV (no document base).
4. **`stream_type` is one of `hls | dash | mp4`.** Misspellings (`HLS`, `m3u8`) lead to player init failures.
5. **`duration_sec` is a number, not a string.** Common JSON drift.
6. **`featured` length ≥ 1 and ≤ 10.** A hero with 0 items breaks the home screen. More than 10 is a UX smell.
7. **Every category has ≥ 1 item.** Empty categories render empty rails — looks broken.

Fail loud on (1) and (4). Warn and continue on others.

## Shaping content for the UI

Past validation, the manifest often needs gentle reshaping to look right:

- **Featured selection.** If `featured` is empty, pick the first 5 videos. If it has 20, take the first 5. The hero is not a backlog.
- **Category ordering.** If categories have a natural order in the source, preserve it. Otherwise alphabetize.
- **Empty states.** Every hook should return `[]` not `undefined` on no data. Screens then show their built-in empty state.
- **Image fallbacks.** If `thumbnail_url` 404s, the template's `<Tile>` shows a placeholder. Make sure `theme.color.surface` looks reasonable — it's the placeholder background.

## When manifest size matters

- **< 100 videos:** stays in `content.json`, loaded synchronously. Fast.
- **100–1000:** still fine as JSON, but pre-index by ID in a `useEffect` to avoid linear scans in `useVideo`.
- **> 1000:** stop using JSON. Generate a SQLite seed file at build time, or fetch from an API. The template's hooks need to become async. This is a structural change — flag it to the planner.

## Anti-patterns

- **Inlining manifest data in screens.** Always go through a hook. Otherwise the next manifest swap requires changes in 12 places.
- **Mutating the manifest at runtime.** The hooks treat it as immutable. If you need user state (watchlist, progress), that's a separate store, not edits to `content.json`.
- **Auto-generating placeholder content to "fill it out".** If the user provided 3 videos, the app has 3 videos. Don't invent. Use empty states where the layout would otherwise look sparse.
- **Skipping validation "to ship faster".** Five minutes saved at inject time = an hour debugging blank screens at simulator time.
