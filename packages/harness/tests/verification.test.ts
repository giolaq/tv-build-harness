import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runVerifyChecks, substituteVars } from "../src/verification.js";

const APP_DIR = "/tmp/tv-harness-test-verify";

const vars = {
  "brand.primary_color": "#ff5500",
  "content.title": "Indie Kitchen",
};

beforeEach(() => {
  rmSync(APP_DIR, { recursive: true, force: true });
  mkdirSync(join(APP_DIR, "src"), { recursive: true });
});

describe("substituteVars", () => {
  it("replaces dotted variables and leaves unknown ones empty", () => {
    expect(substituteVars("color {{brand.primary_color}}!{{nope}}", vars)).toBe("color #ff5500!");
  });
});

describe("runVerifyChecks", () => {
  it("passes when no checks are configured", async () => {
    const result = await runVerifyChecks([], { appDir: APP_DIR, vars });
    expect(result.ok).toBe(true);
  });

  it("file_exists accepts any of multiple candidate paths", async () => {
    writeFileSync(join(APP_DIR, "src", "data.json"), "{}");
    const ok = await runVerifyChecks(
      [{ type: "file_exists", path: ["missing/data", "src/data.json"] }],
      { appDir: APP_DIR, vars }
    );
    expect(ok.ok).toBe(true);

    const fail = await runVerifyChecks(
      [{ type: "file_exists", path: "missing.json", error: "custom message" }],
      { appDir: APP_DIR, vars }
    );
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe("custom message");
  });

  it("grep finds substituted patterns and reports templated errors", async () => {
    writeFileSync(join(APP_DIR, "src", "theme.ts"), "export const primary = '#ff5500';");
    const ok = await runVerifyChecks(
      [{ type: "grep", pattern: "{{brand.primary_color}}", path: "src/" }],
      { appDir: APP_DIR, vars }
    );
    expect(ok.ok).toBe(true);

    const fail = await runVerifyChecks(
      [{ type: "grep", pattern: "{{content.title}}", path: "src/", error: "{{content.title}} not wired" }],
      { appDir: APP_DIR, vars }
    );
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe("Indie Kitchen not wired");
  });

  it("git_dirty passes when git is not initialized, fails on a clean tree, passes on changes", async () => {
    const noGit = await runVerifyChecks([{ type: "git_dirty" }], { appDir: APP_DIR, vars });
    expect(noGit.ok).toBe(true);

    writeFileSync(join(APP_DIR, "seed.txt"), "seed");
    execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", {
      cwd: APP_DIR, stdio: "pipe",
    });
    const clean = await runVerifyChecks([{ type: "git_dirty" }], { appDir: APP_DIR, vars });
    expect(clean.ok).toBe(false);

    writeFileSync(join(APP_DIR, "new.txt"), "change");
    const dirty = await runVerifyChecks([{ type: "git_dirty" }], { appDir: APP_DIR, vars });
    expect(dirty.ok).toBe(true);
  });

  it("command checks run with substitution and surface failures", async () => {
    const ok = await runVerifyChecks(
      [{ type: "command", run: "test -d src", timeoutMs: 5_000 }],
      { appDir: APP_DIR, vars }
    );
    expect(ok.ok).toBe(true);

    const fail = await runVerifyChecks(
      [{ type: "command", run: "false", timeoutMs: 5_000, error: "expected failure" }],
      { appDir: APP_DIR, vars }
    );
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe("expected failure");
  });

  it("stops at the first failing check", async () => {
    const result = await runVerifyChecks(
      [
        { type: "file_exists", path: "missing.json", error: "first" },
        { type: "command", run: "false", timeoutMs: 5_000, error: "second" },
      ],
      { appDir: APP_DIR, vars }
    );
    expect(result.error).toBe("first");
  });
});
