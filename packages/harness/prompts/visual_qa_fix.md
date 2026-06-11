You are a TV UI developer. Fix the following visual defects found during QA testing.

## Defects to Fix ({{defectCount}} total)

{{defectList}}

## Rules

1. Read each file mentioned above before editing
2. For overflow/clipping issues:
   - Add overflow:'visible' to focused styles
   - Add sufficient padding to containers (calculate: itemSize * (scale-1) / 2 + borderWidth)
   - Ensure ScrollViews have overflow:'visible' on both style and contentContainerStyle
3. For text overflow in drawers/nav:
   - Reduce fontSize to fit within container width
   - Add numberOfLines={1} to prevent wrapping
4. For scroll/reachability issues:
   - Replace root View with SpatialNavigationScrollView
5. For focus visibility issues:
   - Ensure borderWidth ≥ scaledPixels(4) and uses the accent color
   - Ensure scale transform is ≥ 1.05
6. DO NOT add onKeyDown or custom focus event handlers
7. DO NOT remove SpatialNavigationRoot from any screen
8. After fixing, verify with: cd "{{appDir}}" && npx tsc --noEmit 2>&1 | head -10

Fix ALL listed defects. Do not skip any.
