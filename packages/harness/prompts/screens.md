Customize screens to match the AppSpec. The principle is REUSE FIRST — only create new screens if the template doesn't have one that fits.

STEP 1: Discover what screens already exist.
Use the loaded skill to find the screens directory and understand available layouts.

STEP 2: Match AppSpec screens to template screens.
AppSpec screens:
{{screensList}}

For each AppSpec screen:
- If "uses_template_screen" is set, verify that screen exists and only make minor customizations.
- If the layout matches an existing template screen, reuse it.
- Only create a NEW screen file if no existing screen can serve the purpose.

STEP 3: Create any genuinely new screens.
Use the loaded skill to understand the correct location, component patterns, and focus/navigation system for new screens.

Key rules from the loaded skill:
- Use the existing focusable/pressable components — they already handle D-pad navigation internally
- Do NOT add custom arrow-key or focus event handlers — the navigation library owns all D-pad events
- Do NOT modify the remote-control manager files
- Follow the screen activation pattern the skill describes (deactivating focus when off-screen or when navigation overlay is open)
- Use the scrollable container pattern the skill describes for screens with content below the viewport
- Account for focused scale transforms in list item sizing (the skill has the formula)

{{#if hasDrawer}}
IMPORTANT: Every screen must deactivate its focus root when the drawer is open. Use the loaded skill for the exact pattern.
{{/if}}
{{#if noDrawer}}
Every screen must deactivate its focus root when not the active route. Use the loaded skill for the exact pattern.
{{/if}}

STEP 4: Remove all hardcoded template placeholder data from reused screens.
The template's DetailsScreen (and possibly other screens) contains hardcoded placeholder crew/cast names, descriptions, and metadata that do NOT come from the content manifest. Find and replace ALL hardcoded text in reused screens:
- Remove or replace any hardcoded person names (Director, Producer, Star, Cast sections with static names)
- Replace with data from the route params (passed from the content manifest) OR remove the section entirely if the content data doesn't include that metadata
- Grep for common template placeholders: `grep -rn "Director\|Producer\|Star\|Cast" "{{appDir}}"/packages/shared-ui/src/screens/`

If the content manifest has tags/genres, show those instead. If it has a publisher or other metadata, use that. If it has nothing relevant, remove the crew section entirely — empty is better than fake data.

STEP 5: Export all screens from the screens index.
Find the barrel/index file and add exports for any new screens.

STEP 6: Verify.
Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1 | head -20
Fix any TypeScript errors.
