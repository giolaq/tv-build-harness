import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const focusCheckDefinition: ToolDefinition = {
  name: "run_focus_check",
  description: "Static lint for TV focus/accessibility: checks that all interactive elements are focusable and reachable via D-pad navigation",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
    },
    required: ["workdir"],
  },
};

interface FocusIssue {
  file: string;
  line: number;
  severity: "error" | "warning";
  message: string;
}

export const focusCheckHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const screensDir = join(workdir, "packages", "shared-ui", "src", "screens");
  const componentsDir = join(workdir, "packages", "shared-ui", "src", "components");

  const issues: FocusIssue[] = [];

  const scanDirs = [screensDir, componentsDir].filter(d => existsSync(d));

  for (const dir of scanDirs) {
    scanDirectory(dir, workdir, issues);
  }

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");

  const report = [
    `Focus check complete: ${errors.length} errors, ${warnings.length} warnings`,
    "",
    ...issues.map(i => `[${i.severity.toUpperCase()}] ${i.file}:${i.line} — ${i.message}`),
  ].join("\n");

  return {
    ok: errors.length === 0,
    output: report,
    error: errors.length > 0 ? `${errors.length} focus errors found` : undefined,
  };
};

function scanDirectory(dir: string, workdir: string, issues: FocusIssue[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, workdir, issues);
    } else if (entry.name.endsWith(".tsx")) {
      checkFile(fullPath, workdir, issues);
    }
  }
}

function checkFile(filePath: string, workdir: string, issues: FocusIssue[]): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const relPath = relative(workdir, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // TouchableOpacity/TouchableHighlight without accessible prop on TV
    if (line.includes("TouchableOpacity") || line.includes("TouchableHighlight")) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "warning",
        message: "Use Pressable instead of TouchableOpacity/TouchableHighlight for better TV focus support",
      });
    }

    // onPress without hasTVPreferredFocus consideration
    if (line.includes("onPress") && !line.includes("Pressable") && line.includes("<View")) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "error",
        message: "onPress on a View is not focusable via D-pad. Wrap with Pressable.",
      });
    }

    // ScrollView without focusable children check
    if (line.includes("<ScrollView") && !content.includes("Pressable") && !content.includes("FlatList")) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "warning",
        message: "ScrollView without focusable children — D-pad cannot scroll to off-screen content",
      });
      break; // Only flag once per file
    }

    // FlatList without keyExtractor
    if (line.includes("<FlatList") && !contentHasNearby(lines, i, 10, "keyExtractor")) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "warning",
        message: "FlatList without keyExtractor — may cause focus restoration issues after scroll",
      });
    }

    // TextInput without proper TV keyboard handling
    if (line.includes("<TextInput") && !contentHasNearby(lines, i, 5, "returnKeyType")) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "warning",
        message: "TextInput without returnKeyType — TV remote 'select' behavior may be unclear",
      });
    }

    // Interactive element without focus styling. Matches both the bare
    // Pressable `focused` state and the react-tv-space-navigation render-prop
    // idiom (`isFocused`, `watchButtonFocused`, ...) — hence case-insensitive.
    if (line.includes("<Pressable") && !contentHasNearbyRegex(lines, i, 10, /focused/i)) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "error",
        message: "Pressable without focus styling — element will be invisible to D-pad users when focused",
      });
    }

    // Image used as a button without a focusable wrapper. An `onSelect` handler
    // or a SpatialNavigationFocusableView/Pressable/TVFocusGuideView above means
    // the spatial-navigation wrapper already owns focus — that's the correct
    // pattern, not a defect.
    if (
      line.includes("<Image") &&
      hasNakedOnPressNearby(lines, i, 3) &&
      !contentHasNearbyRegex(lines, Math.max(0, i - 5), 10, /SpatialNavigationFocusableView|<Pressable|TVFocusGuideView/)
    ) {
      issues.push({
        file: relPath,
        line: lineNum,
        severity: "error",
        message: "Image with onPress is not focusable. Wrap Image in a Pressable.",
      });
    }
  }
}

function contentHasNearby(lines: string[], index: number, range: number, keyword: string): boolean {
  const start = Math.max(0, index - range);
  const end = Math.min(lines.length - 1, index + range);
  for (let i = start; i <= end; i++) {
    if (lines[i].includes(keyword)) return true;
  }
  return false;
}

function contentHasNearbyRegex(lines: string[], index: number, range: number, pattern: RegExp): boolean {
  const start = Math.max(0, index - range);
  const end = Math.min(lines.length - 1, index + range);
  for (let i = start; i <= end; i++) {
    if (pattern.test(lines[i])) return true;
  }
  return false;
}

// onPress on its own is a button signal; `onSelect={onPress}` is the
// spatial-navigation wrapper forwarding the handler — not a naked press target.
function hasNakedOnPressNearby(lines: string[], index: number, range: number): boolean {
  const start = Math.max(0, index - range);
  const end = Math.min(lines.length - 1, index + range);
  for (let i = start; i <= end; i++) {
    if (lines[i].includes("onPress") && !lines[i].includes("onSelect")) return true;
  }
  return false;
}
