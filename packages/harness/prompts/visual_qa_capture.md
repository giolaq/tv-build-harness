You are a test automation engineer. Capture screenshots of the TV app for visual QA analysis.

Create the directory: mkdir -p {{iterDir}}

Write and run this Puppeteer script (save as {{workdir}}/capture-iter-{{iter}}.cjs):

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const dir = '{{iterDir}}';
  fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let n = 0;
  async function shot(name) {
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(dir, `${String(++n).padStart(2,'0')}-${name}.png`) });
    console.log('Shot: ' + name);
  }

  async function focusNth(sel, idx) {
    await page.evaluate((s, i) => {
      const els = document.querySelectorAll(s);
      if (els[i]) { els[i].focus(); els[i].dispatchEvent(new FocusEvent('focus', {bubbles:true})); }
    }, sel, idx);
    await new Promise(r => setTimeout(r, 600));
  }

  try {
    await page.goto('http://localhost:{{port}}', { waitUntil: 'networkidle0', timeout: 60000 });

    // Wait for React to actually render (not just the HTML shell)
    await page.waitForFunction(() => {
      const root = document.getElementById('root') || document.body;
      return root.querySelectorAll('[data-testid], [role="button"], [tabindex], img, [data-focusable]').length > 3;
    }, { timeout: 30000 }).catch(() => console.log('Warning: React render wait timed out'));

    // Extra settle time for animations/transitions
    await new Promise(r => setTimeout(r, 3000));
    await page.click('body');
    await new Promise(r => setTimeout(r, 500));

    const cardSel = await page.evaluate(() => {
      for (const s of ['[data-focusable="true"]','[role="button"]','[tabindex="0"]']) {
        if (document.querySelectorAll(s).length > 2) return s;
      }
      return '[tabindex]';
    });

    // Home screen states
    await shot('home-default');
    await focusNth(cardSel, 0);
    await shot('home-first-card-focused');
    await focusNth(cardSel, 1);
    await shot('home-second-card-focused');
    await focusNth(cardSel, 3);
    await shot('home-mid-row-focused');

    // Second row
    const row2 = await page.evaluate((s) => {
      const c = document.querySelectorAll(s);
      if (c.length < 4) return -1;
      const t = c[0].getBoundingClientRect().top;
      for (let i=1;i<c.length;i++) if (c[i].getBoundingClientRect().top > t+50) return i;
      return Math.min(5, c.length-1);
    }, cardSel);
    if (row2 > 0) { await focusNth(cardSel, row2); await shot('home-row2-focused'); }

    // Scroll far
    const last = Math.min(await page.evaluate((s) => document.querySelectorAll(s).length-1, cardSel), 12);
    if (last > 5) { await focusNth(cardSel, last); await shot('home-far-scroll'); }

    // Navigation
    const navOpened = await page.evaluate(() => {
      const t = document.querySelector('[data-testid*="menu"],[aria-label*="menu"],[aria-label*="Menu"]');
      if (t) { t.click(); return true; }
      const tab = document.querySelector('[role="tab"]');
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (navOpened) { await new Promise(r => setTimeout(r, 800)); await shot('nav-open'); }

    // Visit other screens
    const navItems = await page.evaluate(() =>
      document.querySelectorAll('[role="tab"],[role="menuitem"],[data-testid*="nav"],a[href]').length
    );
    for (let i = 0; i < Math.min(navItems, {{routeCount}}); i++) {
      await page.evaluate((idx) => {
        const items = document.querySelectorAll('[role="tab"],[role="menuitem"],[data-testid*="nav"],a[href]');
        if (items[idx]) items[idx].click();
      }, i);
      await new Promise(r => setTimeout(r, 1500));
      await shot('screen-' + (i+1));
      await focusNth(cardSel, 0);
      await shot('screen-' + (i+1) + '-focused');
      await page.keyboard.press('Backspace');
      await new Promise(r => setTimeout(r, 800));
    }

    // Detail view
    await page.goto('http://localhost:{{port}}', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-focusable], [role="button"], [tabindex]').length > 2, { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate((s) => { const c = document.querySelectorAll(s); if(c[0]) c[0].click(); }, cardSel);
    await new Promise(r => setTimeout(r, 1500));
    await shot('detail-view');

    // 720p responsive
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('http://localhost:{{port}}', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-focusable], [role="button"], [tabindex]').length > 2, { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await shot('home-720p');
    await focusNth(cardSel, 0);
    await shot('home-720p-focused');

    console.log('Total: ' + n + ' screenshots');
  } catch(e) {
    console.error('Error:', e.message);
    await shot('error-state');
  }
  await browser.close();
})();

Run: cd {{workdir}} && node capture-iter-{{iter}}.cjs 2>&1

If puppeteer is not available:
Run: npm install --prefix {{workdir}} puppeteer 2>&1 | tail -3
Then re-run the script.
