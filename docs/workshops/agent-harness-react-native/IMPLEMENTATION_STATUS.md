# Workshop Implementation Status

## Complete and key-free

- Four-stage mini-harness fixtures, including Steps 3 and 4.
- Pocket Cinema React Native source, synthetic catalog, brief, typecheck, and tests.
- Workshop CLI for doctor, plan, guarded run, detach/status/logs, project memory, Bee context, and production Vega handoff.
- Source-copy exclusions, portability report, fixed seed, cost cap, and JSON contracts.
- ADBT, file, and Bee context providers. ADBT uses Strands `McpClient`, discovers named tools, captures approved workflows before `vega_port`, and always disconnects; project memory remains approval-gated.
- Vega capability adapter and production `tv-build` subprocess boundary.
- Guarded three-phase Vega port with Zod-typed read-only Strands tools, schema-validated patches, Git commits, verification retry, rollback, recording/replay, and cost abort.
- Executable focus-state checks for launch, movement boundaries, details, Back, and restoration.
- Eight-gate Vega lifecycle adapter with a clearly labeled key-free replay fixture.
- Live `react-native build-vega` pass on SDK `0.22.5875`, producing three architecture packages.
- Key-free Pocket Cinema port recording and typechecked `vega-buildable` checkpoint.
- Lessons 00-10, worksheet, instructor guide, troubleshooting, checkpoint contracts, and replay guidance.
- Workshop path checker, checkpoint packager, unit tests, and production regression checks.
- Pocket Cinema TV Build inputs validated with zero errors and zero warnings.

## Rehearsal-deferred

These artifacts require the workshop's pinned live environment and must not be fabricated:

- Live VDA install, launch, D-pad recording, screenshots, and device logs.
- Complete generated Vega app, device screenshots, logs, and platform result.
- Real model cost and duration.
- Consented live Bee transcript demonstration; the synthetic snapshot already covers the key-free path.
- Clean-machine and fresh-developer timing results.

ADBT is pinned to `@amazon-devices/amazon-devices-buildertools-mcp@1.0.5`. Live ports start it over stdio with Strands `McpClient`, query its workflow catalog and React Native migration workflows, save hashes, and disconnect. Replay uses `fixtures/adbt-port-context.json`. Complete the remaining live-device artifacts during rehearsal and scrub all recordings before committing them.
