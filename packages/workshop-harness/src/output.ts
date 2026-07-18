export function json(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ...payload })}\n`);
}

export function failure(code: string, message: string, hint: string, exitCode = 1): never {
  json({ error: { code, message, hint } });
  process.exitCode = exitCode;
  throw new CliFailure();
}

export class CliFailure extends Error {}
