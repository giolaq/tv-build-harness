import type { ContextSnapshot } from "../contracts.js";

export type ContextCandidate = { id: string; recordedAt: string; title: string; summary?: string };

export interface ContextProvider {
  search(query: string): Promise<ContextCandidate[]>;
  snapshot(ids: string[], query: string): Promise<ContextSnapshot>;
}
