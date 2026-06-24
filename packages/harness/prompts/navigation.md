Update the app navigation to match the AppSpec.

Navigation type requested: {{resolvedType}}
Routes:
{{routesList}}

STEP 1: Understand the current navigation and focus setup.
Use the loaded skill to find the navigation files and understand the focus/spatial-navigation integration. Note what exists — you must preserve the focus system.

STEP 2: Apply the navigation type.
{{typeInstructions}}

Use the loaded skill to understand the correct navigation patterns and focus integration for this platform.

Key rules:
- Preserve the existing focus management system — do NOT remove or bypass it
- Make navigation UI elements (tabs, drawer items) focusable using the platform's focus primitives
- Do NOT add custom arrow-key or focus event listeners — the focus library owns D-pad events
- Keep the remote-control directory and its platform handlers untouched

STEP 3: Wire the routes.
Each route must point to an EXISTING screen component. Find what screens exist before wiring.
Only import screens that exist. Do NOT import non-existent screens.

STEP 4: Verify focus integration.
After wiring navigation, use the loaded skill's verification commands to confirm:
- Every screen has its focus root component
- Navigation UI elements are reachable via D-pad
- Screen focus deactivates correctly when not the active route

{{#if hasDrawer}}
CRITICAL: When the drawer is open, every screen's focus root must be deactivated. Use the loaded skill for the exact pattern and verification commands.
{{/if}}

STEP 5: Verify.
Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1 | head -20
Fix any TypeScript errors.
