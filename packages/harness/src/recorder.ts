import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface RecordedTurn {
  timestamp: string;
  phase: string;
  request: {
    model: string;
    system: string;
    messages: unknown[];
    tools?: unknown[];
  };
  response: unknown;
  usage: { input_tokens: number; output_tokens: number };
}

export class Recorder {
  private turns: RecordedTurn[] = [];
  private filePath: string;
  private enabled: boolean;

  constructor(filePath: string, enabled: boolean = true) {
    this.filePath = filePath;
    this.enabled = enabled;
    if (enabled) {
      mkdirSync(dirname(filePath), { recursive: true });
    }
  }

  record(turn: RecordedTurn): void {
    if (!this.enabled) return;
    this.turns.push(turn);
  }

  save(): void {
    if (!this.enabled || this.turns.length === 0) return;
    writeFileSync(this.filePath, JSON.stringify(this.turns, null, 2));
  }

  static load(filePath: string): RecordedTurn[] {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as RecordedTurn[];
  }
}

export class ReplayClient {
  private turns: RecordedTurn[];
  private index: number = 0;
  private speed: number;

  constructor(recordingPath: string, options: { speed?: number } = {}) {
    this.turns = Recorder.load(recordingPath);
    this.speed = normalizeSpeed(options.speed);
  }

  async nextResponse(): Promise<{ response: unknown; usage: { input_tokens: number; output_tokens: number } } | null> {
    const turn = await this.nextTurn();
    if (!turn) return null;
    return { response: turn.response, usage: turn.usage };
  }

  async nextTurn(): Promise<RecordedTurn | null> {
    if (this.index >= this.turns.length) return null;

    const turn = this.turns[this.index];
    this.index++;

    const delay = this.index > 1
      ? timeDiff(this.turns[this.index - 2].timestamp, turn.timestamp)
      : 500;

    await sleep(Math.min(delay, 2000) / this.speed);

    return turn;
  }

  get remaining(): number {
    return this.turns.length - this.index;
  }

  get total(): number {
    return this.turns.length;
  }

  get phases(): string[] {
    return [...new Set(this.turns.map((turn) => turn.phase))];
  }

  get totals(): { tokens: number; costUsd: number } {
    return summarizeRecordedTurns(this.turns);
  }
}

export function summarizeRecordedTurns(turns: RecordedTurn[]): { tokens: number; costUsd: number } {
  return turns.reduce(
    (totals, turn) => {
      totals.tokens += turn.usage.input_tokens + turn.usage.output_tokens;
      totals.costUsd += costFromResponse(turn.response);
      return totals;
    },
    { tokens: 0, costUsd: 0 }
  );
}

export function costFromResponse(response: unknown): number {
  if (Array.isArray(response)) {
    return response.reduce((sum, item) => sum + costFromResponse(item), 0);
  }
  if (response && typeof response === "object") {
    const value = (response as { total_cost_usd?: unknown }).total_cost_usd;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function normalizeSpeed(speed: number | undefined): number {
  if (speed === undefined) return 1;
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return speed;
}

function timeDiff(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
