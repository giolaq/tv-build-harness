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

  constructor(recordingPath: string) {
    this.turns = Recorder.load(recordingPath);
  }

  async nextResponse(): Promise<{ response: unknown; usage: { input_tokens: number; output_tokens: number } } | null> {
    if (this.index >= this.turns.length) return null;

    const turn = this.turns[this.index];
    this.index++;

    const delay = this.index > 1
      ? timeDiff(this.turns[this.index - 2].timestamp, turn.timestamp)
      : 500;

    await sleep(Math.min(delay, 2000));

    return { response: turn.response, usage: turn.usage };
  }

  get remaining(): number {
    return this.turns.length - this.index;
  }

  get total(): number {
    return this.turns.length;
  }
}

function timeDiff(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
