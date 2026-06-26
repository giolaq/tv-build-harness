import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, Expected } from "@tv-build/shared-types";

interface ContentManifest {
  title: string;
  description: string;
  categories: { id: string; name: string; items: string[] }[];
  videos: { id: string; title: string; description: string; duration_sec: number; thumbnail_url: string; stream_url: string; stream_type: string; tags: string[] }[];
  featured: string[];
}

export function runContentChecks(appPath: string, inputDir: string, expected: Expected): CheckResult[] {
  const results: CheckResult[] = [];

  // Load the input content manifest
  const contentPath = join(inputDir, "content.json");
  if (!existsSync(contentPath)) {
    results.push({ level: 4, name: "content:input_manifest", severity: "warn", message: "No content.json in input directory — skipping content checks" });
    return results;
  }

  const manifest: ContentManifest = JSON.parse(readFileSync(contentPath, "utf-8"));

  // Find the generated data file
  const dataDir = join(appPath, "packages/shared-ui/src/data");
  const possibleDataFiles = ["moviesData.ts", "contentData.ts", "data.ts", "videos.ts"];
  let dataContent = "";
  let dataFilePath = "";

  for (const f of possibleDataFiles) {
    const p = join(dataDir, f);
    if (existsSync(p)) {
      dataContent = readFileSync(p, "utf-8");
      dataFilePath = p;
      break;
    }
  }

  if (!dataContent) {
    // Also check for json data files
    const jsonPath = join(dataDir, "content.json");
    if (existsSync(jsonPath)) {
      dataContent = readFileSync(jsonPath, "utf-8");
      dataFilePath = jsonPath;
    }
  }

  if (!dataContent) {
    results.push({ level: 4, name: "content:data_file", severity: "fail", message: "No data file found in packages/shared-ui/src/data/" });
    return results;
  }

  results.push({ level: 4, name: "content:data_file", severity: "pass", message: `Data file found: ${dataFilePath.split("/").pop()}` });

  // Check video titles are present in the data
  let found = 0;
  const missing: string[] = [];
  for (const video of manifest.videos) {
    if (dataContent.includes(video.title)) {
      found++;
    } else {
      missing.push(video.title);
    }
  }

  const totalExpected = expected.content_items_expected ?? manifest.videos.length;
  const fidelityRate = found / manifest.videos.length;

  results.push({
    level: 4,
    name: "content:video_titles",
    severity: found >= totalExpected ? "pass" : found > 0 ? "warn" : "fail",
    message: `${found}/${manifest.videos.length} video titles found in data (fidelity: ${(fidelityRate * 100).toFixed(1)}%)`,
    details: { found, total: manifest.videos.length, missing: missing.slice(0, 10) },
  });

  // Check category names
  let catFound = 0;
  const catMissing: string[] = [];
  for (const cat of manifest.categories) {
    if (dataContent.includes(cat.name)) {
      catFound++;
    } else {
      catMissing.push(cat.name);
    }
  }

  results.push({
    level: 4,
    name: "content:categories",
    severity: catFound === manifest.categories.length ? "pass" : catFound > 0 ? "warn" : "fail",
    message: `${catFound}/${manifest.categories.length} categories found`,
    details: { found: catFound, total: manifest.categories.length, missing: catMissing },
  });

  // Check specific content titles from expected (if provided)
  if (expected.content_titles && expected.content_titles.length > 0) {
    let titleFound = 0;
    const titleMissing: string[] = [];
    for (const title of expected.content_titles) {
      if (dataContent.includes(title)) {
        titleFound++;
      } else {
        titleMissing.push(title);
      }
    }
    results.push({
      level: 4,
      name: "content:expected_titles",
      severity: titleFound === expected.content_titles.length ? "pass" : "fail",
      message: `${titleFound}/${expected.content_titles.length} expected titles found`,
      details: { missing: titleMissing },
    });
  }

  // Check stream URLs are referenced (not necessarily identical — could be mapped)
  let streamFound = 0;
  for (const video of manifest.videos) {
    if (dataContent.includes(video.stream_url) || dataContent.includes(video.thumbnail_url)) {
      streamFound++;
    }
  }

  results.push({
    level: 4,
    name: "content:asset_references",
    severity: streamFound === manifest.videos.length ? "pass" : streamFound > manifest.videos.length / 2 ? "warn" : "fail",
    message: `${streamFound}/${manifest.videos.length} videos have stream/thumbnail URLs referenced`,
  });

  // Check featured items are somehow referenced
  let featuredFound = 0;
  for (const featId of manifest.featured) {
    const video = manifest.videos.find(v => v.id === featId);
    if (video && dataContent.includes(video.title)) {
      featuredFound++;
    }
  }

  if (manifest.featured.length > 0) {
    results.push({
      level: 4,
      name: "content:featured",
      severity: featuredFound === manifest.featured.length ? "pass" : featuredFound > 0 ? "warn" : "fail",
      message: `${featuredFound}/${manifest.featured.length} featured items referenced`,
    });
  }

  return results;
}
