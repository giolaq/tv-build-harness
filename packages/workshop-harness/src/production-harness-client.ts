import { runProcess, type ProcessResult } from "./process.js";

export type HarnessEvent = Record<string, unknown> & { schemaVersion: 1 };

export class ProductionHarnessClient {
  constructor(private command = process.env.TV_BUILD_BIN ?? "tv-build") {}

  async run(inputDir: string, options: { plan?: boolean; yes?: boolean; seed?: string; maxCost?: number } = {}): Promise<{ result: ProcessResult; events: HarnessEvent[] }> {
    const args = ["claude-run", inputDir, "--json"];
    if (options.plan) args.push("--plan");
    if (options.yes) args.push("--yes");
    if (options.seed) args.push("--seed", options.seed);
    if (options.maxCost !== undefined) args.push("--max-cost", String(options.maxCost));
    const result = await runProcess(this.command, args, options.plan ? 15_000 : 30 * 60_000);
    return { result, events: parseEvents(result.stdout) };
  }
}

export function parseEvents(stdout: string): HarnessEvent[] {
  return stdout.split("\n").filter(Boolean).map((line) => {
    const event = JSON.parse(line) as HarnessEvent;
    if (event.schemaVersion !== 1) throw new Error(`Unsupported tv-build schemaVersion: ${String(event.schemaVersion)}`);
    return event;
  });
}
