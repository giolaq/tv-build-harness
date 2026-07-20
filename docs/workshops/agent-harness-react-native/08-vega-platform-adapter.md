# 8. Build and Test on Vega

## Goal

Use ADBT for Vega guidance, then save build and device evidence in the run report.

ADBT gives the agent current Vega instructions and diagnostics. The generated package uses the SDK template shape and React Native's `build-vega` command. Vega CLI installs and launches the package. VDA supplies device status, logs, and screenshots. The harness runs those steps in order and stops when a gate fails.

## Do this

1. Use the `runId` from lesson 6 and print the lifecycle plan:

```sh
cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts vega-run <runId> --plan --json
```

2. Read the plan before continuing. Check the app path, SDK, eight commands, and confirmation requirement.
3. Run the key-free replay:

```sh
npx tsx src/index.ts vega-run <runId> \
  --platform-replay ../../docs/workshops/agent-harness-react-native/fixtures/vega-lifecycle.json \
  --yes --json
```

4. Open `out/<runId>/vega-platform-result.json`. Confirm it records:

- pinned ADBT and Vega SDK versions;
- device-status output;
- build, install, and launch results;
- logs and a screenshot path;
- the focus transition result;
- any remaining blocker.

## Optional live device run

ADBT is optional unless an agent needs live Vega guidance. `init-context` changes `CLAUDE.md` and your Claude configuration, so run it before the workshop and review those changes. Check the pinned setup:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 check-status --agent claude-code-cli
vega --version
```

Start the virtual device in a system terminal and leave that terminal open:

```sh
vega virtual-device start --gui
```

In a second terminal, wait until both commands show an attached device:

```sh
vega virtual-device status
vega exec vda devices -l
```

Install the pinned Vega package dependencies in the guarded copy, then run the same approved lifecycle without the replay flag:

```sh
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO/packages/workshop-harness/out/<runId>/app/apps/vega"
npm install
cd "$REPO/packages/workshop-harness"
npx tsx src/index.ts vega-run <runId> \
  --yes --json
```

If you use `checkpoints/vega-buildable/app`, run `npm ci` instead because that checkpoint includes the tested lockfile.

The lifecycle stops at the first failed gate. An empty `devices -l` result is a device failure even when the command exits successfully. Fix the device once or switch to replay; do not keep launching builds with no attached target.

## Why this matters

Platform commands should live behind a small adapter. The agent can use ADBT knowledge when needed, while the harness keeps build, install, launch, and test results consistent.

## You are done when

For replay, the result contains eight successful lifecycle steps, the focus transition check, a log path, a screenshot path, and `evidenceMode: "replay"`. For a live device claim, require `evidenceMode: "live"` plus real install, launch, log, and screenshot evidence. Never present replay as device certification.

## If blocked

Try one repair for no more than 10 minutes. Then use the platform replay command. Device setup is optional; understanding the lifecycle and evidence is required.
