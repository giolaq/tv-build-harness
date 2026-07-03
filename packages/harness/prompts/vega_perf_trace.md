Analyze Vega launch and rendering performance.

## Context

- App directory: {{appDir}}
- Screenshot/artifact directory: {{artifactDir}}
- TTFF budget: {{ttffBudget}} ms
- TTFD budget: {{ttfdBudget}} ms
- JS frame drop budget: {{frameDropBudget}}%

## Required Workflow

1. Confirm the app builds and can launch on the Vega Virtual Device.
2. Collect or locate a Perfetto/platform trace for app launch and first interaction.
3. If Amazon Devices Builder Tools MCP is available, call `analyze_perfetto_traces` on the trace.
4. Compare results against the configured budgets:
   - TTFF <= {{ttffBudget}} ms
   - TTFD <= {{ttfdBudget}} ms
   - JS frame drop <= {{frameDropBudget}}%
5. If a metric fails, make the smallest code change that addresses the bottleneck.

## Fallback

If trace capture or `analyze_perfetto_traces` is unavailable, do not invent metrics. Report the blocker and include exact setup steps:

`npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context`

## Output

Create or update `{{artifactDir}}/vega-perf-summary.md` with:
- Trace path
- Metrics found
- Budget comparison
- Fixes applied
- Remaining blockers
