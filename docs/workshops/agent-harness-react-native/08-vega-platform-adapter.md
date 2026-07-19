# 8. Build and Test on Vega

## Goal

Use ADBT for Vega guidance and the Android-style device workflow, then save the build and device evidence in the run report.

ADBT gives the agent current Vega instructions and diagnostics. Kepler builds the app. VDA runs it. The harness decides the order, records the result, and stops when a check fails.

## Do this

1. Start the Vega Virtual Device.
2. In a system terminal, check the instructor-pinned ADBT installation:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> check-status --agent claude-code-cli
```

3. Return to the repository. Use the `runId` from lesson 6:

```sh
cd packages/workshop-harness
npx tsx src/index.ts vega-run <runId> --plan --json
```

4. Read the plan before continuing. Check the app path, SDK, device, commands, seed, and cost cap.
5. After approval, run:

```sh
npx tsx src/index.ts vega-run <runId> \
  --yes --seed workshop-v1 --max-cost 10 --json
```

6. Open the generated Vega report. Record:

- ADBT and Vega SDK versions;
- virtual device image and status;
- build and launch result;
- relevant logs and screenshots;
- D-pad transition results;
- any remaining blocker.

## Why this matters

Platform commands should live behind a small adapter. The agent can use ADBT knowledge when needed, while the harness keeps build, install, launch, and test results consistent.

## You are done when

The report separates environment failures from app failures and contains enough evidence for another developer to repeat the test.

## If blocked

Try one repair for no more than 10 minutes. Then use `checkpoints/complete/` and inspect its report. Device setup is optional; understanding the handoff is required.
