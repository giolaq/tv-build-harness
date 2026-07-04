import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateInputDir } from "../src/validate.js";

describe("input validation warnings", () => {
  it("reports semantic warnings without errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-validate-"));
    try {
      writeFileSync(join(dir, "content.json"), JSON.stringify({
        title: "Demo",
        description: "Demo catalog",
        categories: Array.from({ length: 11 }, (_, index) => ({
          id: `c${index}`,
          name: `Rail ${index}`,
          items: ["v1"],
        })),
        videos: [{
          id: "v1",
          title: "Video",
          description: "One video",
          duration_sec: 60,
          thumbnail_url: "http://example.com/thumb.jpg",
          stream_url: "https://example.com/stream.m3u8",
          stream_type: "hls",
          tags: ["demo"],
        }],
        featured: ["v1"],
      }));
      writeFileSync(join(dir, "brand.json"), JSON.stringify({
        name: "Demo",
        primary_color: "#111111",
        accent_color: "#222222",
        background_color: "#000000",
        font_family: "Inter",
        logo_path: "http://example.com/logo.png",
        splash_path: "",
      }));

      const result = validateInputDir(dir);
      const warningCodes = result.warnings.map((warning) => warning.code);

      expect(result.errors).toEqual([]);
      expect(warningCodes).toContain("sparse_rail");
      expect(warningCodes).toContain("too_many_rails");
      expect(warningCodes).toContain("brand_contrast");
      expect(warningCodes).toContain("missing_prompt");
      expect(warningCodes).toContain("non_https_url");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing content as an error", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-build-validate-missing-"));
    try {
      const result = validateInputDir(dir);
      expect(result.errors).toEqual([
        expect.objectContaining({ code: "missing_content", file: "content.json" }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

