import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/tool-registry.js";
import type { ToolDefinition, ToolResult } from "../src/types.js";

const testTool: ToolDefinition = {
  name: "test_tool",
  description: "A test tool",
  input_schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
};

describe("ToolRegistry", () => {
  it("registers and executes a tool", async () => {
    const registry = new ToolRegistry();
    registry.register(testTool, async (input) => ({
      ok: true,
      output: `got: ${input.value}`,
    }));

    const result = await registry.execute("test_tool", { value: "hello" });
    expect(result.ok).toBe(true);
    expect(result.output).toBe("got: hello");
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nonexistent", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown tool: nonexistent");
  });

  it("catches thrown errors from tool handlers", async () => {
    const registry = new ToolRegistry();
    registry.register(testTool, async () => {
      throw new Error("handler exploded");
    });

    const result = await registry.execute("test_tool", { value: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("handler exploded");
  });

  it("returns all registered tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register(testTool, async () => ({ ok: true, output: null }));
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("test_tool");
  });

  it("filters definitions by name", () => {
    const registry = new ToolRegistry();
    registry.register(testTool, async () => ({ ok: true, output: null }));
    registry.register(
      { ...testTool, name: "other_tool" },
      async () => ({ ok: true, output: null })
    );

    const filtered = registry.getDefinitionsForNames(["test_tool"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("test_tool");
  });
});
