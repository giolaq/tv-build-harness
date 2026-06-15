export interface PhaseMessage {
  type: "text" | "tool_use" | "tool_result";
  content: string;
  toolName?: string;
}

export interface PhaseResult {
  phase: string;
  status: "success" | "failed" | "degraded";
  iterations: number;
  error?: string;
}

export interface WSEvent {
  type: string;
  phase?: string;
  result?: PhaseResult;
  cost?: number;
  total?: number;
  budget?: number;
  current?: number;
  max?: number;
  message?: string;
  msg?: PhaseMessage;
  runId?: string;
  status?: string;
  error?: string;
}

export interface ExampleInputs {
  prompt: string;
  content: Record<string, unknown>;
  brand: Record<string, unknown> | null;
  design: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  screens: Record<string, unknown> | null;
}

export interface RunInfo {
  id: string;
  date: string;
  hasReport: boolean;
  hasSpec: boolean;
}
