const BASE = "";

export async function fetchExamples(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/examples`);
  return res.json();
}

export async function fetchExample(name: string) {
  const res = await fetch(`${BASE}/api/examples/${name}`);
  return res.json();
}

export async function startRun(input: Record<string, unknown>): Promise<{ runId: string }> {
  const res = await fetch(`${BASE}/api/runs/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to start run");
  }
  return res.json();
}

export async function stopRun(): Promise<void> {
  await fetch(`${BASE}/api/runs/stop`, { method: "POST" });
}

export async function fetchRuns() {
  const res = await fetch(`${BASE}/api/runs`);
  return res.json();
}

export async function fetchSpec(runId: string) {
  const res = await fetch(`${BASE}/api/runs/${runId}/spec`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchScreenshots(runId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/runs/${runId}/screenshots`);
  return res.json();
}
