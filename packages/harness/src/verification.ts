import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VerifyCheck } from "./harness-config.js";
import { focusCheckHandler } from "./tools/focus-check.js";

export interface VerifyContext {
  appDir: string;
  // Flat variable bag for {{var}} substitution, e.g. "brand.primary_color".
  vars: Record<string, string>;
}

export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function runVerifyChecks(
  checks: VerifyCheck[],
  ctx: VerifyContext
): Promise<{ ok: boolean; error?: string }> {
  for (const check of checks) {
    const result = await runCheck(check, ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function runCheck(
  check: VerifyCheck,
  ctx: VerifyContext
): Promise<{ ok: boolean; error?: string }> {
  const fail = (fallback: string) => ({
    ok: false,
    error: substituteVars(check.error ?? fallback, ctx.vars),
  });

  switch (check.type) {
    case "file_exists": {
      const paths = Array.isArray(check.path) ? check.path : [check.path];
      const found = paths.some((p) => existsSync(join(ctx.appDir, substituteVars(p, ctx.vars))));
      return found ? { ok: true } : fail(`Expected file not found: ${paths.join(" or ")}`);
    }

    case "grep": {
      const pattern = substituteVars(check.pattern, ctx.vars);
      try {
        const out = execSync(
          `grep -r ${JSON.stringify(pattern)} ${JSON.stringify(check.path)} 2>/dev/null | head -1`,
          { cwd: ctx.appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        );
        if (out.trim()) return { ok: true };
      } catch {
        // grep exits non-zero on no match — fall through to fail
      }
      return fail(`Pattern "${pattern}" not found in ${check.path}`);
    }

    case "git_dirty": {
      if (!existsSync(join(ctx.appDir, ".git"))) return { ok: true };
      try {
        const diff = execSync("git diff --stat", { cwd: ctx.appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ctx.appDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        if (diff.trim() || untracked.trim()) return { ok: true };
        return fail("Phase made no file changes");
      } catch {
        return { ok: true };
      }
    }

    case "tsc": {
      try {
        execSync("npx tsc --noEmit", {
          cwd: ctx.appDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 60_000,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? ((err as { stdout?: string }).stdout ?? err.message) : String(err);
        return fail(`TypeScript errors remain: ${msg.slice(0, 200)}`);
      }
    }

    case "focus_check": {
      const result = await focusCheckHandler({ workdir: ctx.appDir });
      if (result.ok) return { ok: true };
      // Prefer output: it has the file:line detail that gets fed back to the
      // agent on retry; error is just a one-line summary.
      return fail(`Focus check failed: ${String(result.output ?? result.error).slice(0, 1500)}`);
    }

    case "command": {
      try {
        execSync(substituteVars(check.run, ctx.vars), {
          cwd: ctx.appDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: check.timeoutMs,
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(`Command failed: ${msg.slice(0, 200)}`);
      }
    }
  }
}
