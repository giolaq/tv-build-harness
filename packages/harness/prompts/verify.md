Run all static checks and fix any errors found.

STEP 1: Apply template-specific pre-checks.
Use the loaded skill to run any required pre-verification steps (dependency validation, config checks, etc.) before the type-check.

STEP 2: Type-check.
Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1
Fix all errors: missing imports, type mismatches, unused imports from removed template code.

STEP 3: Lint (if available).
Run: cd "{{appDir}}" && npx eslint src/ --ext .ts,.tsx 2>&1 | tail -20
Fix auto-fixable issues.

STEP 4: Verify all screens are reachable.
Check that every exported screen is referenced in the navigation config.

STEP 5: Verify focus system integrity.
Use the loaded skill's verification commands to check:
- No duplicate registration of the focus/navigation event system (causes double-step focus bug)
- No React StrictMode or equivalent pattern that could double-register listeners
- Every screen activates/deactivates its focus root correctly

{{#if hasDrawer}}
STEP 6: Verify drawer focus isolation.
Use the loaded skill to check that every screen deactivates its focus root when the drawer is open. The skill has the exact pattern and count-verification commands.
{{/if}}
{{#if noDrawer}}
STEP 6: Verify screen focus isolation.
Use the loaded skill to check that every screen deactivates its focus root when not the active route.
{{/if}}

STEP 7: Verify scrollable screens.
Any screen with content that extends below the viewport must use the scrollable container pattern. Use the loaded skill to check detail/content screens.

STEP 8: Verify list item sizing.
For any horizontal scrolling list with focused scale transforms, verify item sizes account for the scale and borders. Use the loaded skill for the formula and verification approach.

STEP 9: Verify the focus manager's event listener return type.
Use the loaded skill to check that the remote control manager returns the correct type from its addKeydownListener method. Returning a wrapper instead of the original listener causes accumulated listeners and double navigation.

Report: errors found, errors fixed, any remaining.
