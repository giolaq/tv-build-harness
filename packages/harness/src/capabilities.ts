export const EXECUTOR_CAPABILITIES = {
  "claude-cli": ["pipeline", "json-events", "record", "replay", "shared-tools"],
  "agent-sdk": ["pipeline", "json-events", "record", "replay", "shared-tools"],
  strands: ["pipeline", "json-events", "record", "replay", "shared-tools"],
} as const;

export const REQUIRED_EXECUTOR_CAPABILITIES = ["pipeline", "json-events", "replay", "shared-tools"] as const;
