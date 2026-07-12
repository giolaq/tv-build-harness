import type { PlatformContext, RemoteAction } from "./types.js";

export interface FocusObservation {
  id?: string;
  text?: string;
  bounds?: string;
}

export interface DpadStep {
  action: RemoteAction;
  expectFocus?: string;
}

export interface DpadFlowResult {
  ok: boolean;
  steps: Array<DpadStep & { observed?: FocusObservation; error?: string }>;
}

export interface FocusAwareAdapter {
  input(context: PlatformContext, actions: RemoteAction[]): Promise<{ ok: boolean; message: string }>;
  observeFocus(context: PlatformContext): Promise<FocusObservation | undefined>;
}

export async function runDpadFlow(adapter: FocusAwareAdapter, context: PlatformContext, flow: DpadStep[]): Promise<DpadFlowResult> {
  const results: DpadFlowResult["steps"] = [];
  for (const step of flow) {
    const input = await adapter.input(context, [step.action]);
    if (!input.ok) {
      results.push({ ...step, error: input.message });
      return { ok: false, steps: results };
    }
    const observed = await adapter.observeFocus(context);
    const identity = observed?.id || observed?.text;
    if (step.expectFocus && identity !== step.expectFocus) {
      results.push({ ...step, observed, error: `Expected focus ${step.expectFocus}, observed ${identity ?? "none"}` });
      return { ok: false, steps: results };
    }
    results.push({ ...step, observed });
  }
  return { ok: true, steps: results };
}
