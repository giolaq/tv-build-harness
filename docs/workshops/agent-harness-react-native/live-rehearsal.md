# Live Vega Rehearsal

Date: 20 July 2026

## Passed

- Vega SDK `0.22.5875` was available.
- ADBT `1.0.5` ran as a stdio MCP server through Strands `McpClient`. The harness discovered `list_documents` and `read_document`, loaded the two React Native port workflows, saved their hashes, and disconnected without changing agent configuration.
- The SDK-generated application structure was used as the reference.
- `npm run build:debug` completed with `react-native build-vega`.
- The manifest passed validation.
- `.vpkg` files were produced for `aarch64`, `armv7`, and `x86_64`.
- The JavaScript bundle included the guarded Pocket Cinema app and shared focus-state module.

## Still blocked

In the automation session, the installed Vega Virtual Device reports ready and then its detached process is cleaned up. Starting it through a separately opened Terminal window from the same automation session has the same result. `vega virtual-device status` returns `running: false`.

The harness now handles this boundary correctly: an empty `vega exec vda devices -l` result stops the lifecycle at `device_status`, returns a failed result, and does not reuse old logs or screenshots. It does not build or claim device evidence while no target is attached.

Install, launch, device logs, and real screenshots remain unverified. For the next rehearsal, start VDA manually in a system terminal, leave it open, and verify both commands before running the lifecycle:

```sh
vega virtual-device status
vega exec vda devices -l
```

Do not replace the replay checkpoint with live-device evidence until VDA stays attached and all remaining lifecycle gates pass.

## Dependency note

The SDK 0.22 template depends on React Native 0.72-era packages. `npm install` reported 10 audit findings. Keep this package isolated for workshop use, use the pinned direct versions, and do not run `npm audit fix --force` because it can break SDK compatibility.

## Evidence boundary

The committed replay fixture proves the eight-gate adapter, failure handling, focus check, and report contract. The live rehearsal proves SDK discovery, manifest validation, bundling, and package generation. Neither is a live-device certification until install, launch, logs, and screenshot capture pass against an attached VDA target.
