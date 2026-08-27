---
name: static-data-hooks-precompute
applies_to: [vega_hot_functions, vega_perf_trace]
meta:
  created_by_run: 18cb29d3
  created_at: 2026-07-13
  times_loaded: 0
  times_defect_recurred: 0
---

# Pre-compute Static Data Hook Results

## Problem

TV app data hooks (e.g. `useFeatured()`, `useVideosByCategory()`) that wrap a static in-memory content manifest look like React hooks but don't use `useMemo`. They return freshly-allocated arrays and objects on every render. On a HomeScreen with 3-4 content rails, this means 30-50+ object allocations per frame during D-pad navigation — creating GC pressure and defeating downstream `useMemo` dependency checks that rely on referential stability.

## Fix Pattern

```typescript
// BEFORE (broken) — allocates on every render
export function useVideosByCategory(categoryId: string): CardData[] {
  const category = manifest.categories.find(c => c.id === categoryId);
  if (!category) return [];
  return category.items
    .map(id => videosById.get(id))
    .filter((v): v is Video => v !== undefined)
    .map(v => videoToCardData(v, category.name));
}

// AFTER (fixed) — pre-computed at module load, O(1) lookup
const categoryCardsById = new Map<string, CardData[]>(
  manifest.categories.map(cat => [
    cat.id,
    cat.items
      .map(id => videosById.get(id))
      .filter((v): v is Video => v !== undefined)
      .map(v => videoToCardData(v, cat.name)),
  ]),
);

export function useVideosByCategory(categoryId: string): CardData[] {
  return categoryCardsById.get(categoryId) ?? [];
}
```

Similarly for BokehAtmosphere-style components with parameterized inline styles:

```typescript
// BEFORE (broken) — inline objects defeat React.memo
<View style={[styles.bokeh1, { opacity: 0.06 * multiplier }]} />

// AFTER (fixed) — pre-built StyleSheet per intensity
const opacityStyles = {
  subtle: StyleSheet.create({ b1: { opacity: 0.06 } }),
  medium: StyleSheet.create({ b1: { opacity: 0.084 } }),
};
// In component:
<View style={[styles.bokeh1, opacityStyles[intensity].b1]} />
```

## Decision Tree

1. Is the data source static (embedded JSON, hardcoded manifest, no async fetch)?
   - Yes → pre-compute into module-level constants
   - No → use `useMemo` with proper deps, or React Query cache
2. Does the "hook" take a parameter (e.g. category ID)?
   - Yes → pre-build a Map keyed by all known parameter values
   - No → single module-level constant
3. Does a component pass inline style objects that vary by prop?
   - Yes, finite variants (e.g. 3 intensity levels) → pre-build StyleSheet per variant
   - Yes, continuous range → `useMemo` on the prop value

## Gotchas

- Don't pre-compute if the manifest is fetched asynchronously or can change at runtime — you'd serve stale data.
- If `videoToCardData()` incorporates mutable state (user favorites, watch progress), pre-computing is wrong. Only pre-compute pure transformations of static data.
- The empty array `[]` literal as a fallback creates a new reference each call — use a module-level `const EMPTY: CardData[] = []` instead.
- `StyleSheet.create` inside a function body is an anti-pattern — it must be at module scope to benefit from the native optimization bridge.
