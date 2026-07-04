export const JSON_SCHEMA_VERSION = 1;

export const EXIT = {
  success: 0,
  input: 1,
  runFailure: 2,
  environment: 3,
  aborted: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface JsonError {
  schemaVersion: 1;
  error: {
    code: string;
    message: string;
    hint: string;
  };
}

export function isJsonMode(args: string[]): boolean {
  return args.includes("--json");
}

export function jsonObject(payload: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, ...payload });
}

export function jsonEvent(event: string, payload: Record<string, unknown> = {}): string {
  return jsonObject({ event, ...payload });
}

export function jsonError(code: string, message: string, hint: string): JsonError {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    error: { code, message, hint },
  };
}

export function writeJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${jsonObject(payload)}\n`);
}

export function writeEvent(event: string, payload: Record<string, unknown> = {}): void {
  process.stdout.write(`${jsonEvent(event, payload)}\n`);
}

export function writeError(code: string, message: string, hint: string): void {
  process.stdout.write(`${JSON.stringify(jsonError(code, message, hint))}\n`);
}

