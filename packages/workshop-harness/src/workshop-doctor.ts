import { runProcess } from "./process.js";

export type DoctorCheck = { name: string; status: "pass" | "repair" | "optional"; detail: string; hint?: string };

export async function workshopDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [{ name: "node", status: Number(process.versions.node.split(".")[0]) >= 18 ? "pass" : "repair", detail: process.version, hint: "Install Node 18 or newer." }];
  checks.push(await commandCheck("tv-build", process.env.TV_BUILD_BIN ?? "tv-build", ["--help"], "Build packages/harness or set TV_BUILD_BIN."));
  const adbtPackage = process.env.ADBT_PACKAGE;
  if (adbtPackage) checks.push(await commandCheck("adbt", "npx", ["-y", adbtPackage, "check-status", "--agent", "claude-code-cli"], "Run ADBT init-context in a system terminal."));
  else checks.push({ name: "adbt", status: "repair", detail: "workshop version is not pinned", hint: "Set ADBT_PACKAGE to the instructor-pinned package@version." });
  checks.push(await commandCheck("kepler", process.env.KEPLER_BIN ?? "kepler", ["--version"], "Install Vega SDK 0.22 and Kepler CLI."));
  checks.push(await commandCheck("bee", process.env.BEE_BIN ?? "bee", ["--version"], "Optional: install/configure Bee or use the file fixture.", true));
  return checks;
}

async function commandCheck(name: string, command: string, args: string[], hint: string, optional = false): Promise<DoctorCheck> {
  try {
    const result = await runProcess(command, args, 2_000);
    if (result.code === 0) return { name, status: "pass", detail: result.stdout.trim() || "available" };
    return { name, status: optional ? "optional" : "repair", detail: result.timedOut ? "timed out" : `exit ${result.code}`, hint };
  } catch {
    return { name, status: optional ? "optional" : "repair", detail: "not found", hint };
  }
}
