import { snapshotHash } from "../project-memory.js";
import { runProcess } from "../process.js";
import type { ContextSnapshot } from "../contracts.js";
import type { ContextCandidate, ContextProvider } from "./types.js";

type BeeConversation = { id: string; recordedAt?: string; title?: string; summary?: string; decisions?: string[]; constraints?: string[]; openQuestions?: string[] };

export class BeeContextProvider implements ContextProvider {
  constructor(private command = process.env.BEE_BIN ?? "bee") {}

  async search(query: string): Promise<ContextCandidate[]> {
    const result = await runProcess(this.command, ["conversations", "search", query, "--json"], 5_000);
    if (result.code !== 0) throw new Error(`Bee search failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    const parsed = JSON.parse(result.stdout) as { conversations?: BeeConversation[] } | BeeConversation[];
    const rows = Array.isArray(parsed) ? parsed : parsed.conversations ?? [];
    return rows.map((row) => ({ id: row.id, recordedAt: row.recordedAt ?? "unknown", title: row.title ?? "Bee conversation", summary: row.summary }));
  }

  async snapshot(ids: string[], query: string): Promise<ContextSnapshot> {
    const rows: BeeConversation[] = [];
    for (const id of ids) {
      const result = await runProcess(this.command, ["conversations", "get", id, "--json"], 5_000);
      if (result.code !== 0) throw new Error(`Bee conversation ${id} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      rows.push(JSON.parse(result.stdout) as BeeConversation);
    }
    const base = {
      schemaVersion: 1 as const,
      provider: "bee" as const,
      capturedAt: new Date().toISOString(),
      query,
      sources: rows.map((row) => ({ id: row.id, recordedAt: row.recordedAt ?? "unknown" })),
      decisions: rows.flatMap((row) => row.decisions ?? []),
      constraints: rows.flatMap((row) => row.constraints ?? []),
      openQuestions: rows.flatMap((row) => row.openQuestions ?? []),
    };
    return { ...base, summaryHash: snapshotHash(base) };
  }
}
