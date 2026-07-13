Prepare the generated app for Vega OS support.

## Context

- App directory: {{appDir}}
- App name: {{appName}}
- Amazon Devices Builder Tools package: `@amazon-devices/amazon-devices-buildertools-mcp`

## Required Checks

1. Check local Vega tooling:
   - Use the `amazon_devices_builder_tools` tool with `action="vega_tooling"` if available.
   - Otherwise run:
     - `npx kepler --version`
     - `npx kepler device list`
     - `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status`

2. Check `apps/vega/package.json` exists.

3. Check the Vega manifest exists:
   - `apps/vega/manifest.toml`, `apps/vega/vega.json`, or `apps/vega/manifest.json`

4. Check shared UI for packages that should not be consumed directly by Vega:
   - `react-native-video`
   - `expo-font`
   - `expo-image`

If those imports appear in shared UI, create a `.kepler.ts` override or move the platform-specific implementation behind an existing shared component.

## Builder Tools MCP — REQUIRED

The Amazon Devices Builder Tools MCP server MUST be configured for the Vega pipeline to proceed. Check status:
Run: npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status 2>&1

If the output does NOT show "✅ Configured" for the active agent:
- Report FAILURE and STOP.
- Tell the user to run: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`
- Do NOT proceed to any Vega build or QA phase without Builder Tools MCP.

If configured, verify MCP tools are accessible by calling:
- `mcp__amazon-devices-buildertools-mcp__list_documents` with type "SKILL"

If that tool call succeeds, Builder Tools MCP is live and the pipeline can proceed.

## Output

Write a short status report:
- Builder Tools MCP configured: yes/no (REQUIRED — if no, this is a STOP)
- Kepler CLI available: yes/no
- VDA available: yes/no
- Manifest status
- Forbidden imports found/fixed
- Remaining blockers
