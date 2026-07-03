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

## Builder Tools MCP Usage

If Amazon Devices Builder Tools MCP is configured, use its documentation/search capabilities for any uncertain Vega manifest, media, navigation, focus, or performance question.

Expected MCP capabilities include:
- `search_documentation`
- `analyze_perfetto_traces`
- `get_app_hot_functions`
- `symbolicate_acr`

## Output

Write a short status report:
- Builder Tools MCP configured: yes/no/unknown
- Kepler CLI available: yes/no
- VDA available: yes/no
- Manifest status
- Forbidden imports found/fixed
- Remaining blockers
