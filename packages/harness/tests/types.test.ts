import { describe, it, expect } from "vitest";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
  AppSpecSchema,
  V1_PHASES,
} from "../src/types.js";

describe("V1_PHASES", () => {
  it("contains exactly 10 active phases", () => {
    expect(V1_PHASES).toHaveLength(10);
  });

  it("starts with plan and ends with visual_smoke_test", () => {
    expect(V1_PHASES[0]).toBe("plan");
    expect(V1_PHASES[V1_PHASES.length - 1]).toBe("visual_smoke_test");
  });
});

describe("ContentManifestSchema", () => {
  it("validates a correct manifest", () => {
    const manifest = {
      title: "Test App",
      description: "A test",
      categories: [{ id: "c1", name: "Cat 1", items: ["v1"] }],
      videos: [{
        id: "v1",
        title: "Video 1",
        description: "Desc",
        duration_sec: 120,
        thumbnail_url: "https://example.com/thumb.jpg",
        stream_url: "https://example.com/stream.m3u8",
        stream_type: "hls",
        tags: ["test"],
      }],
      featured: ["v1"],
    };
    expect(() => ContentManifestSchema.parse(manifest)).not.toThrow();
  });

  it("rejects manifest with missing title", () => {
    expect(() => ContentManifestSchema.parse({ categories: [], videos: [], featured: [] })).toThrow();
  });

  it("rejects invalid stream_type", () => {
    const manifest = {
      title: "T",
      description: "D",
      categories: [],
      videos: [{
        id: "v1", title: "V", description: "D", duration_sec: 0,
        thumbnail_url: "x", stream_url: "x", stream_type: "invalid", tags: [],
      }],
      featured: [],
    };
    expect(() => ContentManifestSchema.parse(manifest)).toThrow();
  });
});

describe("BrandKitSchema", () => {
  it("validates a correct brand kit", () => {
    const brand = {
      name: "Test",
      primary_color: "#FF0000",
      accent_color: "#00FF00",
      background_color: "#0000FF",
      font_family: "Inter",
      logo_path: "/logo.svg",
      splash_path: "/splash.png",
    };
    expect(() => BrandKitSchema.parse(brand)).not.toThrow();
  });

  it("rejects missing name", () => {
    expect(() => BrandKitSchema.parse({
      primary_color: "#FF0000", accent_color: "#00FF00",
      background_color: "#0000FF", font_family: "X", logo_path: "", splash_path: "",
    })).toThrow();
  });
});

describe("RunConfigSchema", () => {
  it("applies defaults", () => {
    const config = RunConfigSchema.parse({ platforms: ["androidtv"] });
    expect(config.max_iterations).toBe(90);
    expect(config.max_retries_per_phase).toBe(5);
    expect(config.build_locally).toBe(true);
    expect(config.eas_profile).toBe("preview");
  });

  it("rejects invalid platform", () => {
    expect(() => RunConfigSchema.parse({ platforms: ["roku"] })).toThrow();
  });
});

describe("AppSpecSchema", () => {
  it("validates a minimal app spec", () => {
    const spec = {
      app_name: "Test App",
      theme: { mode: "dark", tokens: { primary: "#fff" } },
      navigation: { type: "drawer", routes: [{ id: "home", label: "Home" }] },
      screens: [{
        id: "home",
        route: "/",
        layout: "hero+rails",
        sections: [{ id: "s1", kind: "featured_hero", data_source: "featured" }],
      }],
      components_to_customize: [],
      components_to_add: [],
      data_bindings: [],
      player: { lib: "react-native-video" },
    };
    expect(() => AppSpecSchema.parse(spec)).not.toThrow();
  });
});
