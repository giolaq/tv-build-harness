import { runProcess } from "./process.js";

export type DoctorCheck = { name: string; status: "pass" | "repair" | "optional"; detail: string; hint?: string };

export async function workshopDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [{ name: "node", status: Number(process.versions.node.split(".")[0]) >= 18 ? "pass" : "repair", detail: process.version, hint: "Install Node 18 or newer." }];
  checks.push(await executorCheck());
  checks.push(await commandCheck("tv-build", process.env.TV_BUILD_BIN ?? "tv-build", ["--help"], "Build packages/harness or set TV_BUILD_BIN."));
  const adbtPackage = process.env.ADBT_PACKAGE;
  if (adbtPackage) checks.push(await commandCheck("adbt", "npx", ["-y", adbtPackage, "check-status", "--agent", "claude-code-cli"], "Run ADBT init-context in a system terminal."));
  else checks.push({ name: "adbt", status: "repair", detail: "workshop version is not pinned", hint: "Set ADBT_PACKAGE to the instructor-pinned package@version." });
  checks.push(await commandCheck("kepler", process.env.KEPLER_BIN ?? "kepler", ["--version"], "Install Vega SDK 0.22 and Kepler CLI."));
  checks.push(await commandCheck("bee", process.env.BEE_BIN ?? "bee", ["--version"], "Optional: install/configure Bee or use the file fixture.", true));
  return checks;
}

async function executorCheck(): Promise<DoctorCheck> {
  if (process.argv.includes("--replay")) return { name: "model-executor", status: "pass", detail: "replay (no model required)" };
  const selected = process.argv.includes("--executor") ? process.argv[process.argv.indexOf("--executor") + 1] : process.env.WORKSHOP_EXECUTOR ?? "claude-cli";
  if (selected === "claude-cli") return commandCheck("model-executor", process.env.CLAUDE_PATH ?? "claude", ["--version"], "Install Claude Code or select --executor strands.");
  const provider = process.argv.includes("--provider") ? process.argv[process.argv.indexOf("--provider") + 1] : process.env.WORKSHOP_PROVIDER ?? "bedrock";
  const key = provider === "openai" ? "OPENAI_API_KEY" : provider === "openrouter" ? "OPENROUTER_API_KEY" : "AWS_PROFILE";
  const ready = Boolean(process.env[key] || (provider === "bedrock" && process.env.AWS_ACCESS_KEY_ID));
  return { name: "model-executor", status: ready ? "pass" : "repair", detail: `Strands ${provider}`, hint: ready ? undefined : `Configure ${key}, or use --executor claude-cli / --replay.` };
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
