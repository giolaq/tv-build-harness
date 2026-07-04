import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  join("examples"),
  join("docs", "course", "fixtures"),
  join("docs", "course", "demos"),
].filter((path) => existsSync(path));

const BLOCKED_DOMAINS = [
  "nintendo.com",
  "nintendo-europe.com",
  "pokemon.com",
];

const domainsOnly = process.argv.includes("--domains-only");
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

async function main(): Promise<void> {
  const jsonFiles = ROOTS.flatMap((root) => walk(root)).filter((file) => file.endsWith(".json"));
  const failures: string[] = [];
  const urls: { file: string; url: string }[] = [];

  for (const file of jsonFiles) {
    const text = readFileSync(file, "utf-8");
    for (const domain of BLOCKED_DOMAINS) {
      if (text.toLowerCase().includes(domain)) {
        failures.push(`${file}: blocked owner domain ${domain}`);
      }
    }
    for (const match of text.matchAll(/https?:\/\/[^"\s]+/g)) {
      urls.push({ file, url: match[0] });
    }
  }

  if (!domainsOnly) {
    for (const item of urls) {
      const ok = await checkUrl(item.url);
      if (!ok) failures.push(`${item.file}: URL did not respond successfully: ${item.url}`);
    }
  }

  if (failures.length > 0) {
    console.error("Example link hygiene failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Checked ${jsonFiles.length} JSON files and ${domainsOnly ? "skipped URL fetches" : `${urls.length} URLs`}.`);
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (head.ok) return true;
    if (![405, 403].includes(head.status)) return false;
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}
