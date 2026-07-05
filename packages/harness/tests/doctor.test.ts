import { describe, expect, it } from "vitest";
import { checkHostPlatform } from "../src/doctor.js";

describe("doctor host platform check", () => {
  it("supports macOS and Linux", () => {
    expect(checkHostPlatform("darwin")).toMatchObject({ ok: true, detail: "macOS supported" });
    expect(checkHostPlatform("linux", "6.8.0")).toMatchObject({ ok: true, detail: "Linux supported" });
    expect(checkHostPlatform("linux", "5.15.0-microsoft-standard-WSL2")).toMatchObject({ ok: true, detail: "Linux via WSL2 supported" });
  });

  it("rejects native Windows with a WSL2 hint", () => {
    expect(checkHostPlatform("win32")).toMatchObject({
      ok: false,
      detail: "Native Windows is not supported.",
      fix: expect.stringContaining("WSL2"),
    });
  });
});
