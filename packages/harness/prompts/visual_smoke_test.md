Test the web version of the app: start it, screenshot every screen, test navigation and focus.

STEP 1: Start the Expo web dev server.
Run: cd {{appDir}}/apps/expo-multi-tv && BROWSER=none EXPO_TV=1 npx expo start --web --port 19006 &
Run: sleep 8

Verify: curl -s http://localhost:19006 | head -5
If it fails, check the process output for errors and try to fix them.

STEP 2: Screenshot every screen.
Write and run this puppeteer script (save as {{outDir}}/test-runner.js then run it):

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Helper: screenshot with name
  async function screenshot(name) {
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: '{{screenshotDir}}/' + name + '.png' });
    console.log('Screenshot: ' + name);
  }

  // Helper: press key
  async function pressKey(key, times = 1) {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  try {
    // 1. Home screen
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle0', timeout: 30000 });
    await screenshot('web-01-home');

    // 2. Test focus navigation with arrow keys (D-pad simulation)
    await pressKey('ArrowRight', 3);
    await screenshot('web-02-home-focus-moved');

    await pressKey('ArrowDown', 2);
    await screenshot('web-03-home-scrolled');

    // 3. Navigate to other screens via keyboard
    // Try opening drawer/menu with ArrowLeft or Tab
    await pressKey('ArrowLeft', 5);
    await screenshot('web-04-navigation-open');

    // Move down through nav items and select
    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-05-second-screen');

    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-06-third-screen');

    // 4. Go back to home, select a content item
    await pressKey('ArrowLeft', 5);
    await pressKey('ArrowUp', 3);
    await pressKey('Enter');
    await new Promise(r => setTimeout(r, 1000));
    await screenshot('web-07-home-returned');

    // Select first content tile
    await pressKey('ArrowRight', 1);
    await pressKey('ArrowDown', 1);
    await pressKey('Enter');
    await screenshot('web-08-detail-screen');

    // 5. Check for errors in console
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    console.log('\nTest Results:');
    console.log('Screenshots captured: 8');
    console.log('Console errors: ' + consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:');
      consoleErrors.slice(0, 5).forEach(e => console.log('  - ' + e));
    }
  } catch(e) {
    console.log('Test error: ' + e.message);
    await screenshot('web-error-state');
  }

  await browser.close();
})();

If puppeteer is not available, do a simpler test:
- curl http://localhost:19006 and verify HTML contains the app name "{{appName}}"
- curl different hash routes if the app uses hash routing (#/categories, #/settings)

STEP 3: Verify focus management.
Check the source code for these focus issues:
- grep -r "Pressable" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l → should be > 0
- grep -r "onFocus\|focused" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" | wc -l → should be > 0
- grep -r "TVFocusGuide\|SpatialNavigation\|react-tv-space-navigation" {{appDir}}/packages/shared-ui/src/ --include="*.tsx" | wc -l → should be > 0

STEP 4: Verify all routes are wired.
Expected routes: {{routeNames}}
Check that each screen component is imported in the navigation:
grep -r "Screen" {{appDir}}/packages/shared-ui/src/navigation/ --include="*.tsx" --include="*.ts"

STEP 5: Kill the dev server.
Run: kill $(lsof -ti:19006) 2>/dev/null || true

STEP 6: Write the test report.
Write {{outDir}}/build-report.txt with:
- Web server: started / failed
- Screenshots captured: count
- Focus navigation: D-pad works / partial / no focus handlers found
- Routes wired: all / missing (list which)
- Console errors: count
- Overall: PASS / PARTIAL / FAIL
