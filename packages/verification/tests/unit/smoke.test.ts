import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allocatePort, runSmokeChecks } from "../../src/levels/smoke.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("smoke hardening", () => {
  it("allocates an ephemeral port", async () => {
    const port = await allocatePort();
    expect(port).toBeGreaterThan(0);
  });

  it("fails as infra when an explicit port is already listening", async () => {
    const port = await allocatePort();
    const server = createServer((_socket) => {});
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
    try {
      const root = appFixture();
      const results = await runSmokeChecks({ appPath: root, port, timeoutMs: 100 });
      expect(results[0]).toMatchObject({
        name: "smoke:port_available",
        severity: "fail",
        details: { infra: true },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function appFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "tv-build-smoke-"));
  roots.push(root);
  mkdirSync(join(root, "apps/expo-multi-tv"), { recursive: true });
  return root;
}
