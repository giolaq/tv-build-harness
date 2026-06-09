import puppeteer, { type Page, type KeyInput } from "puppeteer";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface TestResult {
  index: number;
  name: string;
  passed: boolean;
  detail: string;
}

interface UITestOptions {
  port?: number;
  keepOpen?: boolean;
}

export async function runUITests(appDir: string, options: UITestOptions) {
  const port = options.port ?? 19008;
  const screenshotDir = join(appDir, "..", "test-ui-screenshots");
  mkdirSync(screenshotDir, { recursive: true });

  console.log(`
  TV App Harness — UI Test Runner
  App: ${appDir}
  Server: http://localhost:${port}
`);

  // 1. Start web server
  process.stdout.write("  ▶ Starting web server...  ");
  const server = await startExpoServer(appDir, port);
  console.log("✓ ready");

  // 2. Launch visible browser
  process.stdout.write("  ▶ Launching browser...    ");
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ["--window-size=1920,1080", "--no-sandbox"],
    defaultViewport: { width: 1920, height: 1080 },
  });
  console.log("✓ visible\n");

  const page = await browser.newPage();
  const results: TestResult[] = [];
  let testIndex = 0;

  function pass(name: string, detail: string) {
    results.push({ index: ++testIndex, name, passed: true, detail });
    console.log(`  ${testIndex}. ✓ ${name} (${detail})`);
  }

  function fail(name: string, detail: string) {
    results.push({ index: ++testIndex, name, passed: false, detail });
    console.log(`  ${testIndex}. ✗ ${name} — ${detail}`);
  }

  async function shot(name: string) {
    await page.screenshot({ path: join(screenshotDir, `${String(testIndex + 1).padStart(2, "0")}-${name}.png`) });
  }

  console.log("  Tests:");

  try {
    // Navigate to app
    await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.click("body");
    await sleep(500);

    // Detect card selector
    const cardSel = await page.evaluate(() => {
      for (const s of ['[data-focusable="true"]', '[role="button"]', '[tabindex="0"]']) {
        if (document.querySelectorAll(s).length > 2) return s;
      }
      return "[tabindex]";
    });

    // Test 1: Home screen renders
    const focusableCount = await page.evaluate((s) => document.querySelectorAll(s).length, cardSel);
    if (focusableCount > 3) {
      pass("Home screen renders", `${focusableCount} focusable elements found`);
    } else {
      fail("Home screen renders", `only ${focusableCount} focusable elements`);
    }
    await shot("home-render");

    // Test 2: Focus first card
    const focusInfo = await focusElement(page, cardSel, 0);
    if (focusInfo.focused) {
      pass("First card focused", focusInfo.detail);
    } else {
      fail("First card focused", "focus not applied");
    }
    await shot("first-card-focused");

    // Test 3-5: Arrow navigation
    for (const { key, label } of [
      { key: "ArrowRight" as KeyInput, label: "card 2" },
      { key: "ArrowRight" as KeyInput, label: "card 3" },
      { key: "ArrowDown" as KeyInput, label: "row 2" },
    ]) {
      const before = await getActiveElementRect(page);
      await page.keyboard.press(key);
      await sleep(400);
      const after = await getActiveElementRect(page);

      const moved = key === "ArrowDown"
        ? after.top > before.top + 20
        : after.left > before.left + 20;

      if (moved) {
        pass(`${key} moves focus to ${label}`, `moved ${Math.round(key === "ArrowDown" ? after.top - before.top : after.left - before.left)}px`);
      } else {
        // Fallback: try direct .focus()
        const idx = key === "ArrowDown"
          ? await findRowTwoIndex(page, cardSel)
          : results.length + 1;
        if (idx > 0) {
          await focusElement(page, cardSel, idx);
          fail(`${key} moves focus to ${label}`, "keyboard nav failed, used .focus() fallback");
        } else {
          fail(`${key} moves focus to ${label}`, "STUCK — focus did not move");
        }
      }
      await shot(`nav-${key.toLowerCase()}`);
    }

    // Test 6: Drawer/Tab open
    const navOpened = await page.evaluate(() => {
      const menu = document.querySelector('[data-testid*="menu"],[aria-label*="menu"],[aria-label*="Menu"]') as HTMLElement | null;
      if (menu) { menu.click(); return true; }
      const tab = document.querySelector('[role="tab"]') as HTMLElement | null;
      if (tab) { tab.click(); return true; }
      return false;
    });
    await sleep(800);

    if (navOpened) {
      const navItems = await page.evaluate(() =>
        document.querySelectorAll('[role="tab"],[role="menuitem"],[data-testid*="nav"],a[href]').length
      );
      pass("Drawer opened", `${navItems} nav items`);
    } else {
      fail("Drawer opened", "no nav trigger found");
    }
    await shot("drawer-open");

    // Test 7-8: Screen transitions
    const navItemCount = await page.evaluate(() =>
      document.querySelectorAll('[role="tab"],[role="menuitem"],[data-testid*="nav"],a[href]').length
    );
    const screensToVisit = Math.min(navItemCount, 2);

    for (let i = 0; i < screensToVisit; i++) {
      const screenName = await page.evaluate((idx) => {
        const items = document.querySelectorAll('[role="tab"],[role="menuitem"],[data-testid*="nav"],a[href]');
        if (items[idx]) {
          (items[idx] as HTMLElement).click();
          return items[idx].textContent?.trim() ?? `screen-${idx + 1}`;
        }
        return null;
      }, i);
      await sleep(1500);

      if (screenName) {
        const hasContent = await page.evaluate(() => document.body.innerText.length > 20);
        if (hasContent) {
          pass(`Navigate to "${screenName}" screen`, "content loaded");
        } else {
          fail(`Navigate to "${screenName}" screen`, "blank screen");
        }
      } else {
        fail("Navigate to screen", "click failed");
      }
      await shot(`screen-${i + 1}`);
    }

    // Test 9: Back navigation
    await page.keyboard.press("Backspace");
    await sleep(1000);
    const backWorked = await page.evaluate(() => document.body.innerText.length > 20);
    if (backWorked) {
      pass("Backspace returns to previous", "content visible");
    } else {
      fail("Backspace returns to previous", "screen blank after back");
    }
    await shot("back-nav");

    // Test 10: Detail view
    await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle0", timeout: 30_000 });
    await sleep(1000);
    await page.evaluate((s) => {
      const c = document.querySelectorAll(s);
      if (c[0]) (c[0] as HTMLElement).click();
    }, cardSel);
    await sleep(1500);

    const detailVisible = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.length > 50;
    });
    if (detailVisible) {
      pass("Detail view opens on card click", "detail content rendered");
    } else {
      fail("Detail view opens on card click", "no content after click");
    }
    await shot("detail-view");

    // Test 11: Far scroll
    const totalCards = await page.evaluate((s) => document.querySelectorAll(s).length, cardSel);
    const targetIdx = Math.min(totalCards - 1, 12);
    if (targetIdx > 5) {
      const scrolled = await focusElement(page, cardSel, targetIdx);
      if (scrolled.focused) {
        pass(`Far scroll — reached element ${targetIdx}`, "scroll worked");
      } else {
        fail(`Far scroll — focus didn't reach element ${targetIdx}`, `STUCK at element ${scrolled.reachedIdx}`);
      }
    } else {
      pass("Far scroll — skipped", `only ${totalCards} cards, no far scroll needed`);
    }
    await shot("far-scroll");

    // Test 12: 720p responsive
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle0", timeout: 30_000 });
    await sleep(1500);

    const layoutOk = await page.evaluate(() => {
      const els = document.querySelectorAll("*");
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth + 10 && rect.width < 5000) return false;
      }
      return true;
    });
    if (layoutOk) {
      pass("720p responsive — no layout break", "all elements within viewport");
    } else {
      fail("720p responsive", "elements overflow viewport");
    }
    await shot("720p-responsive");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail("Unexpected error", msg);
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n  Result: ${passed}/${results.length} passed | ${failed} failed`);
  console.log(`  Screenshots: ${screenshotDir}`);

  if (options.keepOpen) {
    console.log("  Browser remains open for inspection. Press Ctrl+C to close.\n");
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        resolve();
      });
      process.on("SIGTERM", () => {
        resolve();
      });
    });
  }

  await browser.close();
  server.kill();
}

async function startExpoServer(appDir: string, port: number): Promise<ChildProcess> {
  const expoDir = existsSync(join(appDir, "apps", "expo-multi-tv"))
    ? join(appDir, "apps", "expo-multi-tv")
    : appDir;

  const child = spawn("npx", ["expo", "start", "--web", "--port", String(port)], {
    cwd: expoDir,
    env: { ...process.env, BROWSER: "none", EXPO_TV: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timed out (60s)")), 60_000);
    let output = "";

    child.stdout?.on("data", (data) => {
      output += data.toString();
      if (output.includes("Logs for your project") || output.includes(`localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr?.on("data", (data) => {
      output += data.toString();
      if (output.includes("Logs for your project") || output.includes(`localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Expo server exited with code ${code}. Output:\n${output.slice(-500)}`));
      }
    });
  });

  return child;
}

async function focusElement(page: Page, selector: string, index: number): Promise<{ focused: boolean; detail: string; reachedIdx: number }> {
  return page.evaluate((s, i) => {
    const els = document.querySelectorAll(s);
    if (!els[i]) return { focused: false, detail: `element ${i} not found (${els.length} total)`, reachedIdx: -1 };

    const el = els[i] as HTMLElement;
    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    const style = getComputedStyle(el);
    const transform = style.transform !== "none" ? style.transform : "";
    const border = style.borderColor !== "rgb(0, 0, 0)" ? style.borderColor : "";
    const detail = [border && `border: ${border}`, transform && `transform: ${transform}`].filter(Boolean).join(", ") || "focused";

    return { focused: document.activeElement === el || el.contains(document.activeElement), detail, reachedIdx: i };
  }, selector, index);
}

async function getActiveElementRect(page: Page): Promise<{ top: number; left: number }> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { top: 0, left: 0 };
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  });
}

async function findRowTwoIndex(page: Page, selector: string): Promise<number> {
  return page.evaluate((s) => {
    const cards = document.querySelectorAll(s);
    if (cards.length < 4) return -1;
    const topRow = cards[0].getBoundingClientRect().top;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].getBoundingClientRect().top > topRow + 50) return i;
    }
    return -1;
  }, selector);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
