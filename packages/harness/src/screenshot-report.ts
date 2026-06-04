import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

export function generateScreenshotReport(outDir: string, appName: string): string | null {
  const screenshotsDir = join(outDir, "screenshots");
  if (!existsSync(screenshotsDir)) return null;

  const files = readdirSync(screenshotsDir).filter(f =>
    f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg")
  );

  if (files.length === 0) return null;

  const screenshots = files.map(f => {
    const data = readFileSync(join(screenshotsDir, f));
    const base64 = data.toString("base64");
    const ext = f.split(".").pop();
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    const name = basename(f, `.${ext}`);
    const parts = name.split("-");
    const platform = parts[0] ?? "unknown";
    const screen = parts.slice(1).join("-") || "home";
    return { name: f, platform, screen, dataUri: `data:${mime};base64,${base64}` };
  });

  // Group by screen
  const byScreen = new Map<string, typeof screenshots>();
  for (const s of screenshots) {
    const list = byScreen.get(s.screen) ?? [];
    list.push(s);
    byScreen.set(s.screen, list);
  }

  const screensHtml = [...byScreen.entries()].map(([screen, shots]) => `
    <div class="screen-group">
      <h2>${screen}</h2>
      <div class="screenshots">
        ${shots.map(s => `
          <div class="screenshot">
            <img src="${s.dataUri}" alt="${s.name}" />
            <span class="platform-label">${s.platform}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName} — Screenshot Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 48px;
    }
    h1 {
      font-size: 32px;
      margin-bottom: 8px;
      color: #fff;
    }
    .meta {
      color: #888;
      font-size: 14px;
      margin-bottom: 48px;
    }
    .screen-group {
      margin-bottom: 48px;
    }
    .screen-group h2 {
      font-size: 20px;
      margin-bottom: 16px;
      text-transform: capitalize;
      color: #ccc;
    }
    .screenshots {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .screenshot {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #333;
      background: #111;
    }
    .screenshot img {
      max-width: 640px;
      max-height: 360px;
      display: block;
    }
    .platform-label {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .empty {
      color: #666;
      font-style: italic;
      padding: 48px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${appName}</h1>
  <p class="meta">Generated ${new Date().toISOString()} — ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"} across ${byScreen.size} screen${byScreen.size === 1 ? "" : "s"}</p>
  ${screensHtml || '<p class="empty">No screenshots captured.</p>'}
</body>
</html>`;

  const reportPath = join(outDir, "screenshots.html");
  writeFileSync(reportPath, html);
  return reportPath;
}
