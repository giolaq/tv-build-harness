import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type RecordedTurn = {
  timestamp: string;
  phase: string;
  request: { model: string; system: string; messages: unknown[] };
  response: unknown;
  usage: { input_tokens: number; output_tokens: number };
  costUsd?: number;
};

export class PortRecorder {
  private turns: RecordedTurn[] = [];
  constructor(private path: string) {}
  record(turn: RecordedTurn): void {
    this.turns.push(turn);
    writeFileSync(this.path, JSON.stringify(this.turns, null, 2));
  }
}

export class PortReplay {
  private index = 0;
  private turns: RecordedTurn[];
  constructor(path: string) { this.turns = JSON.parse(readFileSync(path, "utf8")) as RecordedTurn[]; }
  next(phase: string): RecordedTurn {
    const turn = this.turns[this.index++];
    if (!turn) throw new Error(`Replay exhausted before ${phase}`);
    if (turn.phase !== phase) throw new Error(`Replay phase mismatch: expected ${phase}, found ${turn.phase}`);
    return turn;
  }
  static exists(path?: string): path is string { return Boolean(path && existsSync(path)); }
}
