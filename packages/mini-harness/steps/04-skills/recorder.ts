import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type RecordedTurn = {
  timestamp: string;
  phase: string;
  request: { model: string; system: string; messages: unknown[] };
  response: unknown;
  usage: { input_tokens: number; output_tokens: number };
};

export class Recorder {
  constructor(private path: string, private turns: RecordedTurn[] = []) {}
  record(turn: RecordedTurn) {
    this.turns.push(turn);
    writeFileSync(this.path, JSON.stringify(this.turns, null, 2));
  }
}

export class ReplayClient {
  private index = 0;
  private turns: RecordedTurn[];
  constructor(path: string) {
    this.turns = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : [];
  }
  next(phase: string): RecordedTurn {
    const turn = this.turns[this.index++];
    if (!turn) throw new Error(`Replay exhausted before ${phase}`);
    if (turn.phase !== phase) throw new Error(`Replay phase mismatch: wanted ${phase}, got ${turn.phase}`);
    return turn;
  }
}

export function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  for (const event of Array.isArray(response) ? response : []) {
    const result = event && typeof event === "object" ? (event as { result?: unknown }).result : undefined;
    if (typeof result === "string") return result;
  }
  throw new Error("Replay response did not contain text");
}
