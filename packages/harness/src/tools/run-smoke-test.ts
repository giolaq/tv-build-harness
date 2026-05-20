import { execSync } from "node:child_process";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const runSmokeTestDefinition: ToolDefinition = {
  name: "run_smoke_test",
  description: "Run a D-pad navigation smoke test on a running simulator using adb/xcrun key events",
  input_schema: {
    type: "object",
    properties: {
      platform: { type: "string", description: "Platform to test", enum: ["androidtv", "appletv"] },
      flow: {
        type: "array",
        description: "Sequence of D-pad actions: up, down, left, right, select, back",
      },
    },
    required: ["platform", "flow"],
  },
};

const ANDROID_KEYCODES: Record<string, number> = {
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  select: 23,
  back: 4,
};

const APPLE_TV_KEYS: Record<string, string> = {
  up: "remote button press menu",
  down: "remote button press menu",
  left: "remote button press menu",
  right: "remote button press menu",
  select: "remote button press select",
  back: "remote button press menu",
};

export const runSmokeTestHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const platform = input.platform as string;
  const flow = (input.flow as string[]) ?? ["right", "right", "select", "back"];

  try {
    const results: string[] = [];

    for (const action of flow) {
      if (platform === "androidtv") {
        const keycode = ANDROID_KEYCODES[action];
        if (keycode === undefined) {
          results.push(`Unknown action: ${action}`);
          continue;
        }
        execSync(`adb shell input keyevent ${keycode}`, { stdio: "pipe", timeout: 5_000 });
        results.push(`${action} (keyevent ${keycode})`);
      } else if (platform === "appletv") {
        execSync(`xcrun simctl io booted ${APPLE_TV_KEYS[action] ?? ""}`, { stdio: "pipe", timeout: 5_000 });
        results.push(`${action} (simctl)`);
      }

      await sleep(500);
    }

    return {
      ok: true,
      output: `Smoke test completed: ${flow.length} actions on ${platform}. Actions: ${results.join(" → ")}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: `run_smoke_test (${platform}) failed: ${message}` };
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
