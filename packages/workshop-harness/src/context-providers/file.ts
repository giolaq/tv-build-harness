import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ContextSnapshotSchema } from "../contracts.js";
import type { ContextCandidate, ContextProvider } from "./types.js";

export class FileContextProvider implements ContextProvider {
  constructor(private path: string) {}
  async search(query: string): Promise<ContextCandidate[]> {
    const snapshot = this.read();
    return snapshot.sources.map((source) => ({ id: source.id, recordedAt: source.recordedAt, title: query }));
  }
  async snapshot(): Promise<ReturnType<FileContextProvider["read"]>> { return this.read(); }
  private read() { return ContextSnapshotSchema.parse(JSON.parse(readFileSync(resolve(this.path), "utf8"))); }
}
