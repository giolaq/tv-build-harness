You are a test automation engineer. Capture screenshots of the TV app for visual QA analysis using Chrome DevTools.

The app is running at http://localhost:{{port}}

Create the screenshot directory:
Run: mkdir -p {{iterDir}}

## Instructions

Use the chrome-devtools MCP tools to navigate, interact, and capture screenshots. This gives you REAL keyboard input — the spatial navigation library WILL respond to arrow keys sent via press_key.

## STEP 1: Set viewport and navigate

1. Call `emulate` with viewport "1920x1080x1"
2. Call `navigate_page` with type "url" and url "http://localhost:{{port}}"
3. Wait for the app to render — call `evaluate_script` with:
   ```
   async () => {
     for (let i = 0; i < 30; i++) {
       await new Promise(r => setTimeout(r, 1000));
       const root = document.getElementById('root') || document.body;
       if (root.querySelectorAll('[data-testid], [role="button"], [tabindex], img, [data-focusable]').length > 3) return true;
     }
     return false;
   }
   ```
4. Wait 3 more seconds: `evaluate_script` with `async () => { await new Promise(r => setTimeout(r, 3000)); return true; }`

## STEP 2: Home screen default state

1. Call `take_screenshot` with filePath "{{iterDir}}/01-home-default.png"

## STEP 3: Focus navigation with REAL keyboard input

Now test D-pad navigation using press_key — this sends REAL keyboard events that react-tv-space-navigation responds to:

1. Call `press_key` with key "Tab" (enters the focus tree)
2. Wait: `evaluate_script` → `async () => { await new Promise(r => setTimeout(r, 500)); return true; }`
3. Call `take_screenshot` with filePath "{{iterDir}}/02-home-first-focus.png"

4. Call `press_key` with key "ArrowRight"
5. Wait 500ms (same evaluate_script pattern)
6. Call `take_screenshot` with filePath "{{iterDir}}/03-home-arrow-right.png"

7. Call `press_key` with key "ArrowRight"
8. Wait 500ms
9. Call `take_screenshot` with filePath "{{iterDir}}/04-home-arrow-right-2.png"

10. Call `press_key` with key "ArrowDown"
11. Wait 500ms
12. Call `take_screenshot` with filePath "{{iterDir}}/05-home-arrow-down.png"

13. Press ArrowDown again
14. Wait 500ms
15. Call `take_screenshot` with filePath "{{iterDir}}/06-home-row2.png"

## STEP 4: Scroll far down

1. Press ArrowDown 3 more times (with 300ms waits between each)
2. Call `take_screenshot` with filePath "{{iterDir}}/07-home-scrolled.png"

## STEP 5: Open navigation (drawer or tab)

1. Call `press_key` with key "ArrowLeft" (opens drawer in drawer-nav apps)
2. Wait 800ms
3. Call `take_screenshot` with filePath "{{iterDir}}/08-nav-open.png"

If the drawer opened (you can verify with `take_snapshot` and check for menu items):
4. Press ArrowDown to move to the second nav item
5. Wait 500ms
6. Call `take_screenshot` with filePath "{{iterDir}}/09-nav-item-focused.png"
7. Press Enter to navigate to that screen
8. Wait 1500ms
9. Call `take_screenshot` with filePath "{{iterDir}}/10-screen-2.png"
10. Press Backspace to go back
11. Wait 1000ms

## STEP 6: Detail view

1. Navigate back to home: call `navigate_page` with type "url" and url "http://localhost:{{port}}"
2. Wait for render (same waitForFunction as Step 1)
3. Wait 3s
4. Press Tab to enter focus tree
5. Wait 500ms
6. Press Enter to open the focused card's detail view
7. Wait 1500ms
8. Call `take_screenshot` with filePath "{{iterDir}}/11-detail-view.png"
9. Press Backspace to go back
10. Wait 1000ms
11. Call `take_screenshot` with filePath "{{iterDir}}/12-home-after-back.png"

## STEP 7: 720p responsive check

1. Call `emulate` with viewport "1280x720x1"
2. Call `navigate_page` with type "reload"
3. Wait for render (same pattern)
4. Wait 3s
5. Call `take_screenshot` with filePath "{{iterDir}}/13-home-720p.png"
6. Press Tab, then ArrowRight
7. Wait 500ms
8. Call `take_screenshot` with filePath "{{iterDir}}/14-home-720p-focused.png"

## STEP 8: Reset viewport

1. Call `emulate` with viewport "1920x1080x1"

## Summary

After all steps, report how many screenshots were captured. The screenshots in {{iterDir}}/ will be analyzed by the next step.

## IMPORTANT NOTES

- Use press_key for ALL navigation — ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Enter, Backspace, Tab
- The spatial navigation library responds to real key events (unlike DOM .focus() which it ignores)
- If a step fails, skip it and continue with the next — partial captures are fine
- Wait at least 500ms after each press_key before taking a screenshot (the focus animation needs time)
- Do NOT use click or evaluate_script to trigger focus — use press_key exclusively for navigation testing
