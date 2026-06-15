import { create } from "zustand";
import type { PhaseMessage, PhaseResult } from "../api/types";

interface PhaseState {
  status: "pending" | "running" | "success" | "degraded" | "failed";
  cost?: number;
  iterations?: number;
  iteration?: { current: number; max: number };
  messages: PhaseMessage[];
}

interface RunStore {
  status: "idle" | "running" | "done" | "failed";
  runId: string | null;
  phases: Map<string, PhaseState>;
  currentPhase: string | null;
  selectedPhase: string | null;
  tokensUsed: number;
  tokenBudget: number;
  totalCost: number;
  logs: string[];
  startTime: number | null;

  setSelectedPhase: (phase: string | null) => void;
  handleEvent: (event: Record<string, unknown>) => void;
  reset: () => void;
}

const ALL_PHASES = [
  "plan", "scaffold", "branding", "content", "screens",
  "navigation", "verify", "build_loop", "vega_build_loop", "visual_qa_loop",
];

function initialPhases(): Map<string, PhaseState> {
  const m = new Map<string, PhaseState>();
  for (const p of ALL_PHASES) {
    m.set(p, { status: "pending", messages: [] });
  }
  return m;
}

export const useRunStore = create<RunStore>((set, get) => ({
  status: "idle",
  runId: null,
  phases: initialPhases(),
  currentPhase: null,
  selectedPhase: null,
  tokensUsed: 0,
  tokenBudget: 500_000,
  totalCost: 0,
  logs: [],
  startTime: null,

  setSelectedPhase: (phase) => set({ selectedPhase: phase }),

  reset: () => set({
    status: "idle",
    runId: null,
    phases: initialPhases(),
    currentPhase: null,
    selectedPhase: null,
    tokensUsed: 0,
    totalCost: 0,
    logs: [],
    startTime: null,
  }),

  handleEvent: (event) => {
    const type = event.type as string;
    const state = get();

    switch (type) {
      case "started":
        set({ status: "running", runId: event.runId as string, startTime: Date.now() });
        break;

      case "phaseStart": {
        const phase = event.phase as string;
        const phases = new Map(state.phases);
        phases.set(phase, { ...phases.get(phase)!, status: "running" });
        set({ phases, currentPhase: phase });
        break;
      }

      case "phaseEnd": {
        const phase = event.phase as string;
        const result = event.result as PhaseResult;
        const cost = (event.cost as number) || 0;
        const phases = new Map(state.phases);
        const existing = phases.get(phase)!;
        phases.set(phase, {
          ...existing,
          status: result.status,
          cost,
          iterations: result.iterations,
        });
        set({ phases, totalCost: state.totalCost + cost });
        break;
      }

      case "tokens":
        set({ tokensUsed: event.total as number });
        break;

      case "iteration": {
        const phase = event.phase as string;
        const phases = new Map(state.phases);
        const existing = phases.get(phase)!;
        phases.set(phase, {
          ...existing,
          iteration: { current: event.current as number, max: event.max as number },
        });
        set({ phases });
        break;
      }

      case "log": {
        const logs = [...state.logs, event.message as string].slice(-100);
        set({ logs });
        break;
      }

      case "message": {
        const phase = event.phase as string;
        const msg = event.msg as PhaseMessage;
        const phases = new Map(state.phases);
        const existing = phases.get(phase);
        if (existing) {
          const messages = [...existing.messages, msg];
          if (messages.length > 500) messages.splice(0, messages.length - 500);
          phases.set(phase, { ...existing, messages });
          set({ phases });
        }
        break;
      }

      case "complete":
        set({
          status: event.status === "done" ? "done" : "failed",
          currentPhase: null,
        });
        break;
    }
  },
}));
