import { runProcess } from "./process.js";
import { ADBT_PACKAGE, VEGA_SDK_VERSION } from "./platform/vega.js";

export type DoctorCheck = { name: string; status: "pass" | "repair" | "optional"; detail: string; hint?: string };

export async function workshopDoctor(): Promise<DoctorCheck[]> {
  const replay = process.argv.includes("--replay");
  const liveAdbt = !replay || process.argv.includes("--adbt-live");
  const checks: DoctorCheck[] = [{ name: "node", status: Number(process.versions.node.split(".")[0]) >= 18 ? "pass" : "repair", detail: process.version, hint: "Install Node 18 or newer." }];
  checks.push(await executorCheck());
  if (!liveAdbt) {
    checks.push({ name: "adbt", status: "optional", detail: `${ADBT_PACKAGE} is not needed for replay` });
  } else {
    const input = JSON.stringify({ documentType: "WORKFLOW", target_platform: { device_os: ["vega_os"] } });
    checks.push(await commandCheck("adbt", "npx", ["-y", process.env.ADBT_PACKAGE ?? ADBT_PACKAGE, "exec", "list_documents", "--args", input], "Use the recorded ADBT context or repair the pinned package.", false, 15_000, "runtime workflow catalog available"));
  }
  if (replay) {
    checks.push({ name: "vega", status: "optional", detail: `SDK ${VEGA_SDK_VERSION} is not needed for replay` });
  } else {
    checks.push(await commandCheck("vega", process.env.VEGA_BIN ?? "vega", ["--version"], `Install and select Vega SDK ${VEGA_SDK_VERSION}.`));
  }
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

async function commandCheck(name: string, command: string, args: string[], hint: string, optional = false, timeoutMs = 2_000, successDetail?: string): Promise<DoctorCheck> {
  try {
    const result = await runProcess(command, args, timeoutMs);
    if (result.code === 0) return { name, status: "pass", detail: successDetail ?? (result.stdout.trim() || "available").slice(0, 500) };
    return { name, status: optional ? "optional" : "repair", detail: result.timedOut ? "timed out" : `exit ${result.code}`, hint };
  } catch {
    return { name, status: optional ? "optional" : "repair", detail: "not found", hint };
  }
}
