import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const appUrl = process.argv[2] ?? 'http://localhost:19007';
const outputDir = path.resolve(process.argv[3] ?? path.join(packageDir, 'out', 'manual-screenshots'));
const headless = process.env.HEADLESS !== 'false';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRender(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root') ?? document.body;
      return root.querySelectorAll(
        '[data-testid], [role="button"], [tabindex], img, [data-focusable]',
      ).length > 3;
    },
    { timeout: 30_000 },
  );
  await sleep(3_000);
}

async function pressAndWait(page, key, delay = 500) {
  await page.keyboard.press(key);
  await sleep(delay);
}

async function captureScreenshots() {
  await mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(appUrl);
    await waitForRender(page);

    await page.screenshot({ path: path.join(outputDir, '01-home-default.png') });

    await pressAndWait(page, 'Tab');
    await page.screenshot({ path: path.join(outputDir, '02-home-first-focus.png') });

    await pressAndWait(page, 'ArrowRight');
    await page.screenshot({ path: path.join(outputDir, '03-home-arrow-right.png') });

    await pressAndWait(page, 'ArrowRight');
    await page.screenshot({ path: path.join(outputDir, '04-home-arrow-right-2.png') });

    await pressAndWait(page, 'ArrowDown');
    await page.screenshot({ path: path.join(outputDir, '05-home-arrow-down.png') });

    await pressAndWait(page, 'ArrowDown');
    await page.screenshot({ path: path.join(outputDir, '06-home-row2.png') });

    for (let i = 0; i < 3; i += 1) {
      await pressAndWait(page, 'ArrowDown', 300);
    }
    await page.screenshot({ path: path.join(outputDir, '07-home-scrolled.png') });

    await pressAndWait(page, 'ArrowLeft', 800);
    await page.screenshot({ path: path.join(outputDir, '08-nav-open.png') });

    for (let i = 0; i < 4; i += 1) {
      try {
        await pressAndWait(page, 'ArrowDown');
        await page.screenshot({
          path: path.join(outputDir, `09-nav-item-${i + 1}-focused.png`),
        });

        await pressAndWait(page, 'Enter', 1_500);
        await page.screenshot({ path: path.join(outputDir, `10-screen-${i + 1}.png`) });

        await pressAndWait(page, 'Tab', 0);
        await pressAndWait(page, 'ArrowRight');
        await page.screenshot({
          path: path.join(outputDir, `11-screen-${i + 1}-focused.png`),
        });

        await pressAndWait(page, 'ArrowLeft', 800);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to navigate to screen ${i + 1}: ${message}`);
      }
    }

    await pressAndWait(page, 'Backspace', 1_000);
    await page.goto(appUrl);
    await waitForRender(page);

    await pressAndWait(page, 'Tab');
    await pressAndWait(page, 'Enter', 1_500);
    await page.screenshot({ path: path.join(outputDir, '12-detail-view.png') });

    await pressAndWait(page, 'Backspace', 1_000);
    await page.screenshot({ path: path.join(outputDir, '13-home-after-back.png') });

    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.reload();
    await waitForRender(page);
    await page.screenshot({ path: path.join(outputDir, '14-home-720p.png') });

    await pressAndWait(page, 'Tab', 0);
    await pressAndWait(page, 'ArrowRight');
    await page.screenshot({ path: path.join(outputDir, '15-home-720p-focused.png') });

    console.log(`Screenshot capture completed: ${outputDir}`);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
