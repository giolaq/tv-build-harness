import type { ToolDefinition, ToolHandler, ToolResult } from "./types.js";

export class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, output: null, error: `Unknown tool: ${name}` };
    }

    try {
      return await tool.handler(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, output: null, error: message };
    }
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  getDefinitionsForNames(toolNames: string[]): ToolDefinition[] {
    return toolNames
      .map((name) => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }
}
