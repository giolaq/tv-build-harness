import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Phase, ToolResult } from "./types.js";

export interface LogEntry {
  timestamp: string;
  phase: Phase;
  iteration: number;
  event: "tool_call" | "tool_result" | "phase_start" | "phase_end" | "skill_load" | "auto_skill_create" | "error" | "model_turn";
  tool?: string;
  input?: unknown;
  result?: ToolResult;
  message?: string;
}

export class RunLog {
  private entries: LogEntry[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "");
  }

  log(entry: Omit<LogEntry, "timestamp">): void {
    const full: LogEntry = { ...entry, timestamp: new Date().toISOString() };
    this.entries.push(full);
    appendFileSync(this.filePath, JSON.stringify(full) + "\n");
  }

  phaseStart(phase: Phase, iteration: number): void {
    this.log({ phase, iteration, event: "phase_start" });
  }

  phaseEnd(phase: Phase, iteration: number, message?: string): void {
    this.log({ phase, iteration, event: "phase_end", message });
  }

  toolCall(phase: Phase, iteration: number, tool: string, input: unknown): void {
    this.log({ phase, iteration, event: "tool_call", tool, input });
  }

  toolResult(phase: Phase, iteration: number, tool: string, result: ToolResult): void {
    this.log({ phase, iteration, event: "tool_result", tool, result });
  }

  skillLoad(phase: Phase, iteration: number, message: string): void {
    this.log({ phase, iteration, event: "skill_load", message });
  }

  error(phase: Phase, iteration: number, message: string): void {
    this.log({ phase, iteration, event: "error", message });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getLastNLines(n: number): LogEntry[] {
    return this.entries.slice(-n);
  }
}
