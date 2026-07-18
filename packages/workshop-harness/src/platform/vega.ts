import { runProcess } from "../process.js";

export type VegaCapability = "build" | "install" | "launch" | "logs" | "capture" | "remote_input" | "device_status";

export class VegaAdapter {
  constructor(private kepler = process.env.KEPLER_BIN ?? "kepler", private cwd?: string) {}
  command(capability: VegaCapability, value?: string): string[] {
    const commands: Record<VegaCapability, string[]> = {
      build: ["build"],
      install: ["device", "install"],
      launch: ["device", "launch"],
      logs: ["device", "logs"],
      capture: ["device", "screenshot", value ?? "vega-screen.png"],
      remote_input: ["device", "key", value ?? "DPAD_CENTER"],
      device_status: ["device", "status"],
    };
    return commands[capability];
  }
  async execute(capability: VegaCapability, value?: string) {
    return runProcess(this.kepler, this.command(capability, value), capability === "build" ? 15 * 60_000 : 15_000, this.cwd);
  }
}
