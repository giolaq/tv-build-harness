import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { CheckResult, Expected, RubricScore } from "@tv-harness/shared-types";

const RUBRIC_VERSION = "1.0.0";

const RUBRIC_DEFINITIONS = {
  intent: {
    name: "Intent Fidelity",
    description: "Does the app match the spec's stated purpose and screen layout?",
    criteria: [
      "0: App does not reflect the spec at all (wrong screens, wrong content type)",
      "1: App partially reflects the spec (some screens match, some content correct)",
      "2: App fully reflects the spec (all screens present, content matches intent)",
    ],
  },
  layout: {
    name: "Layout Quality",
    description: "Is the 10-foot TV layout correct? Rails, grids, safe zones, text sizes.",
    criteria: [
      "0: Layout is broken or unusable on TV (overlapping elements, no safe zones)",
      "1: Layout works but has issues (some overflow, inconsistent spacing, small text)",
      "2: Layout is TV-quality (proper safe zones, readable text, good hierarchy)",
    ],
  },
  theme: {
    name: "Theme Consistency",
    description: "Are brand colors, fonts, and design tokens applied consistently?",
    criteria: [
      "0: Theme is not applied (default colors, no branding visible)",
      "1: Theme partially applied (some brand colors present, inconsistent)",
      "2: Theme fully and consistently applied across all screens",
    ],
  },
  visual: {
    name: "Visual Polish",
    description: "Focus indicators, animations, transitions, overall visual quality.",
    criteria: [
      "0: No focus indicators, broken visuals, placeholder images",
      "1: Basic focus indicators present, some rough edges",
      "2: Polished focus system, smooth transitions, production-ready appearance",
    ],
  },
};

interface JudgeConfig {
  model: string;
  validated: boolean;
  apiKey?: string;
}

export function buildJudgePrompt(appPath: string, specDescription: string): string {
  const screensDir = join(appPath, "packages/shared-ui/src/screens");
  const themeDir = join(appPath, "packages/shared-ui/src/theme");

  let screenSamples = "";
  if (existsSync(screensDir)) {
    const screens = readdirSync(screensDir).filter(f => f.endsWith(".tsx")).slice(0, 3);
    for (const screen of screens) {
      const content = readFileSync(join(screensDir, screen), "utf-8");
      screenSamples += `\n--- ${screen} (first 80 lines) ---\n${content.split("\n").slice(0, 80).join("\n")}\n`;
    }
  }

  let themeContent = "";
  const colorsPath = join(themeDir, "colors.ts");
  if (existsSync(colorsPath)) {
    themeContent = readFileSync(colorsPath, "utf-8");
  }

  return `You are a skeptical TV app quality evaluator. Score this generated TV app on 4 dimensions, each 0-2.

BE SKEPTICAL. LLMs tend to over-praise LLM output. Default to lower scores unless evidence clearly supports higher ones. A score of 2 means genuinely production-quality — most generated apps should score 1.

## App Spec
${specDescription}

## Rubric
${Object.entries(RUBRIC_DEFINITIONS).map(([key, def]) => `### ${def.name} (${key})
${def.description}
${def.criteria.join("\n")}`).join("\n\n")}

## Generated App Code Samples

### Theme (colors.ts)
${themeContent || "(not found)"}

### Screen Samples
${screenSamples || "(no screens found)"}

## Your Task
Score each dimension 0, 1, or 2. Be specific about why. Output EXACTLY this JSON format:
\`\`\`json
{
  "intent": { "score": <0|1|2>, "reason": "<why>" },
  "layout": { "score": <0|1|2>, "reason": "<why>" },
  "theme": { "score": <0|1|2>, "reason": "<why>" },
  "visual": { "score": <0|1|2>, "reason": "<why>" }
}
\`\`\``;
}

export function parseJudgeResponse(response: string): { intent: number; layout: number; theme: number; visual: number } | null {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*"intent"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return {
      intent: parsed.intent?.score ?? parsed.intent,
      layout: parsed.layout?.score ?? parsed.layout,
      theme: parsed.theme?.score ?? parsed.theme,
      visual: parsed.visual?.score ?? parsed.visual,
    };
  } catch {
    return null;
  }
}

export async function runRubricChecks(
  appPath: string,
  specDescription: string,
  expected: Expected,
  judgeConfig?: JudgeConfig,
): Promise<{ checks: CheckResult[]; rubric?: RubricScore }> {
  const results: CheckResult[] = [];

  if (!judgeConfig || !judgeConfig.apiKey) {
    results.push({
      level: 5,
      name: "rubric:judge",
      severity: "warn",
      message: "LLM judge not configured (no API key). Rubric scoring requires human evaluation.",
    });
    return { checks: results };
  }

  // Call the LLM judge
  const prompt = buildJudgePrompt(appPath, specDescription);
  let scores: { intent: number; layout: number; theme: number; visual: number } | null = null;

  try {
    const response = callJudge(prompt, judgeConfig);
    scores = parseJudgeResponse(response);
  } catch (err) {
    results.push({
      level: 5,
      name: "rubric:judge_call",
      severity: "fail",
      message: `Judge call failed: ${err instanceof Error ? err.message : err}`,
    });
    return { checks: results };
  }

  if (!scores) {
    results.push({
      level: 5,
      name: "rubric:judge_parse",
      severity: "fail",
      message: "Could not parse judge response",
    });
    return { checks: results };
  }

  const rubric: RubricScore = {
    rubricVersion: RUBRIC_VERSION,
    intent: scores.intent,
    layout: scores.layout,
    theme: scores.theme,
    visual: scores.visual,
    judgeValidated: judgeConfig.validated,
  };

  // Check per-dimension hard thresholds (Risk: sub-threshold fails regardless of average)
  const thresholds = expected.rubric_thresholds;
  if (thresholds) {
    for (const [dim, threshold] of Object.entries(thresholds)) {
      const score = scores[dim as keyof typeof scores];
      const pass = score >= threshold;
      results.push({
        level: 5,
        name: `rubric:${dim}`,
        severity: pass ? "pass" : "fail",
        message: `${dim}: ${score}/2 (threshold: ${threshold})${!judgeConfig.validated ? " [UNVALIDATED]" : ""}`,
        details: { score, threshold, validated: judgeConfig.validated },
      });
    }
  } else {
    // No thresholds — just report scores
    for (const [dim, score] of Object.entries(scores)) {
      results.push({
        level: 5,
        name: `rubric:${dim}`,
        severity: score >= 1 ? "pass" : "fail",
        message: `${dim}: ${score}/2${!judgeConfig.validated ? " [UNVALIDATED]" : ""}`,
        details: { score, validated: judgeConfig.validated },
      });
    }
  }

  // Flag if judge is not validated
  if (!judgeConfig.validated) {
    results.push({
      level: 5,
      name: "rubric:validation_status",
      severity: "warn",
      message: "Judge NOT validated against human ratings. Scores are advisory only until Cohen's κ ≥ 0.6 on ≥20 runs.",
    });
  }

  return { checks: results, rubric };
}

function callJudge(prompt: string, config: JudgeConfig): string {
  // Use Claude CLI to call the judge model
  const result = execSync(
    `echo ${JSON.stringify(prompt)} | claude -p --model ${config.model} --output-format text 2>/dev/null`,
    {
      encoding: "utf-8",
      timeout: 120_000,
      env: { ...process.env, ANTHROPIC_API_KEY: config.apiKey },
    }
  );
  return result;
}

// Calibration command: reads artifact bundles and computes agreement stats
export function calibrate(bundlePaths: string[], humanRatings: Record<string, { intent: number; layout: number; theme: number; visual: number }>): {
  cohensKappa: number;
  spearmanRho: number;
  n: number;
  disagreements: Array<{ runId: string; dimension: string; judge: number; human: number }>;
} {
  const judgeScores: number[] = [];
  const humanScores: number[] = [];
  const disagreements: Array<{ runId: string; dimension: string; judge: number; human: number }> = [];

  for (const bundlePath of bundlePaths) {
    if (!existsSync(bundlePath)) continue;
    const records = JSON.parse(readFileSync(bundlePath, "utf-8")) as Array<{ id: string; rubric?: { intent: number; layout: number; theme: number; visual: number } }>;
    for (const record of records) {
      if (!record.rubric || !humanRatings[record.id]) continue;
      for (const dim of ["intent", "layout", "theme", "visual"] as const) {
        const judgeScore = record.rubric[dim];
        const humanScore = humanRatings[record.id][dim];
        judgeScores.push(judgeScore);
        humanScores.push(humanScore);
        if (judgeScore !== humanScore) {
          disagreements.push({ runId: record.id, dimension: dim, judge: judgeScore, human: humanScore });
        }
      }
    }
  }

  const n = judgeScores.length / 4; // number of runs
  const kappa = computeCohenKappa(judgeScores, humanScores, 3); // 3 categories: 0, 1, 2
  const rho = computeSpearmanRho(judgeScores, humanScores);

  return { cohensKappa: kappa, spearmanRho: rho, n, disagreements };
}

function computeCohenKappa(a: number[], b: number[], k: number): number {
  if (a.length === 0) return 0;
  const n = a.length;
  let po = 0; // observed agreement
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) po++;
  }
  po /= n;

  // Expected agreement
  let pe = 0;
  for (let cat = 0; cat < k; cat++) {
    const pA = a.filter(x => x === cat).length / n;
    const pB = b.filter(x => x === cat).length / n;
    pe += pA * pB;
  }

  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

function computeSpearmanRho(a: number[], b: number[]): number {
  if (a.length === 0) return 0;
  const n = a.length;
  const rankA = getRanks(a);
  const rankB = getRanks(b);
  let dSquaredSum = 0;
  for (let i = 0; i < n; i++) {
    const d = rankA[i] - rankB[i];
    dSquaredSum += d * d;
  }
  return 1 - (6 * dSquaredSum) / (n * (n * n - 1));
}

function getRanks(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j + 1) / 2; // 1-based average rank for ties
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }
  return ranks;
}
