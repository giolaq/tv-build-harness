Identify and fix CPU hot functions in the Vega app.

## Context

- App directory: {{appDir}}
- Artifact directory: {{artifactDir}}
- Maximum hot function share: {{hotFunctionBudget}}%

## Required Workflow

1. Locate CPU trace artifacts from the Vega run, or collect them if the tooling is available.
2. If Amazon Devices Builder Tools MCP is configured, call `get_app_hot_functions`.
3. Identify the top CPU-heavy functions that are inside the generated app or shared UI code.
4. Fix only actionable app-level issues:
   - excessive render loops
   - expensive synchronous transforms in render
   - un-memoized large list item renderers
   - repeated image/content normalization on every focus move
5. Do not rewrite third-party library code.
6. Rebuild or rerun the relevant check after changes.

## Fallback

If MCP hot function analysis is unavailable, use React render inspection and source review only. Report that CPU trace analysis could not be run.

## Output

Create or update `{{artifactDir}}/vega-hot-functions.md` with:
- Hot functions table
- Which entries are app-owned
- Fixes applied
- Remaining bottlenecks
