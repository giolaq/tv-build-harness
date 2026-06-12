You are a test automation engineer. Capture screenshots of the TV app for visual QA analysis.

Create the directory: mkdir -p {{iterDir}}

Write and run this Puppeteer script (save as {{workdir}}/capture-iter-{{iter}}.cjs).
Run it ONCE. Partial captures are fine — if some sections fail, the screenshots that were captured are sufficient. Do NOT rewrite the script, do NOT debug failures, do NOT install packages unless require('puppeteer') itself fails.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const dir = '{{iterDir}}';
  fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({
    // 'shell' (old headless), NOT 'new': the new headless mode's screenshot
    // pipeline hangs indefinitely on this app's continuous animations.
    headless: 'shell',
    args: ['--no-sandbox', '--window-size=1920,1080', '--mute-audio', '--autoplay-policy=no-user-gesture-required']
  });
  let page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let n = 0;
  // Screenshots must never abort the run — a crashed tab loses one shot, not
  // the session. n counts SUCCESSES only: it gates the exit code.
  async function shot(name) {
    try {
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(dir, `${String(n + 1).padStart(2,'0')}-${name}.png`) });
      n++;
      console.log('Shot: ' + name);
    } catch (e) {
      console.log('Shot failed (' + name + '): ' + e.message.split('\n')[0]);
    }
  }

  async function focusNth(sel, idx) {
    try {
      await page.evaluate((s, i) => {
        const els = document.querySelectorAll(s);
        if (els[i]) { els[i].focus(); els[i].dispatchEvent(new FocusEvent('focus', {bubbles:true})); }
      }, sel, idx);
      await new Promise(r => setTimeout(r, 600));
    } catch (e) { console.log('focus failed: ' + e.message.split('\n')[0]); }
  }

  // Always starts from a FRESH page: the Expo dev client reloads the page when
  // the bundle finishes compiling, which detaches the old frame — a page that
  // is not closed but unusable. Retries once if the fresh page detaches too.
  async function gotoHome(viewport) {
    let lastError = new Error('gotoHome: no attempts ran');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        try { if (!page.isClosed()) await page.close(); } catch {}
        page = await browser.newPage();
        await page.setViewport(viewport || { width: 1920, height: 1080 });
        await page.goto('http://localhost:{{port}}', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => {
          const root = document.getElementById('root') || document.body;
          return root.querySelectorAll('[data-testid], [role="button"], [tabindex], img, [data-focusable]').length > 3;
        }, { timeout: 45000 }).catch(() => console.log('Warning: React render wait timed out'));
        await new Promise(r => setTimeout(r, 3000));
        await page.evaluate(() => document.title); // probe: throws if frame detached
        return;
      } catch (e) {
        lastError = e;
        console.log('gotoHome attempt ' + (attempt+1) + ' failed: ' + e.message.split('\n')[0]);
      }
    }
    // Both attempts dead: throw so the section aborts instead of shooting
    // about:blank — blank PNGs would be analyzed as real app defects.
    throw lastError;
  }

  // Each section is independent: a crash (e.g. video playback killing the
  // headless tab) recovers with a fresh page and moves on.
  async function section(name, fn) {
    try {
      await fn();
    } catch (e) {
      console.log('Section "' + name + '" failed: ' + e.message.split('\n')[0]);
      try { await gotoHome(); } catch {}
    }
  }

  let cardSel = '[tabindex]';

  await section('home', async () => {
    await gotoHome();
    await page.click('body').catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    cardSel = await page.evaluate(() => {
      for (const s of ['[data-focusable="true"]','[role="button"]','[tabindex="0"]']) {
        if (document.querySelectorAll(s).length > 2) return s;
      }
      return '[tabindex]';
    });

    await shot('home-default');
    await focusNth(cardSel, 0);
    await shot('home-first-card-focused');
    await focusNth(cardSel, 1);
    await shot('home-second-card-focused');
    await focusNth(cardSel, 3);
    await shot('home-mid-row-focused');

    const row2 = await page.evaluate((s) => {
      const c = document.querySelectorAll(s);
      if (c.length < 4) return -1;
      const t = c[0].getBoundingClientRect().top;
      for (let i=1;i<c.length;i++) if (c[i].getBoundingClientRect().top > t+50) return i;
      return Math.min(5, c.length-1);
    }, cardSel);
    if (row2 > 0) { await focusNth(cardSel, row2); await shot('home-row2-focused'); }

    const last = Math.min(await page.evaluate((s) => document.querySelectorAll(s).length-1, cardSel), 12);
    if (last > 5) { await focusNth(cardSel, last); await shot('home-far-scroll'); }
  });

  await section('navigation', async () => {
    const navOpened = await page.evaluate(() => {
      const t = document.querySelector('[data-testid*="menu"],[aria-label*="menu"],[aria-label*="Menu"]');
      if (t) { t.click(); return true; }
      const tab = document.querySelector('[role="tab"]');
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (navOpened) { await new Promise(r => setTimeout(r, 800)); await shot('nav-open'); }

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
  });

  await section('detail-view', async () => {
    await gotoHome();
    await page.evaluate((s) => { const c = document.querySelectorAll(s); if(c[0]) c[0].click(); }, cardSel);
    await new Promise(r => setTimeout(r, 1500));
    await shot('detail-view');
  });

  await section('720p', async () => {
    await gotoHome({ width: 1280, height: 720 });
    await shot('home-720p');
    await focusNth(cardSel, 0);
    await shot('home-720p-focused');
  });

  console.log('Total: ' + n + ' screenshots');
  // browser.close() can hang forever on a crashed tab — never wait on it.
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10000))]);
  // Any screenshots at all = usable run.
  process.exit(n > 0 ? 0 : 1);
})();

Run: cd {{workdir}} && node capture-iter-{{iter}}.cjs 2>&1

If (and only if) the script fails with "Cannot find module 'puppeteer'":
Run: npm install --prefix {{workdir}} puppeteer 2>&1 | tail -3
Then re-run the script once.
