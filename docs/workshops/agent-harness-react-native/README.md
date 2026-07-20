# Past the Vibes

In this workshop, you build a small coding harness and use it to adapt one React Native flow for Vega TV.

Use the [workshop web app](index.html) during the session. It gives you the commands, shows what to inspect, and tracks your progress. The Markdown lessons use the same numbering and exercises. If the hosted copy is unavailable, open `index.html` from your clone.

## What you will do

1. Run one model call and identify what it cannot prove.
2. Add checks and retry once with the exact failure.
3. Split the work into phases, commits, and checkpoints.
4. Separate skills, tools, and model executors.
5. Review project context before saving it as memory.
6. Copy and inspect a React Native app before changing it.
7. Adapt one flow for TV remote navigation.
8. Replay the full Vega lifecycle, then optionally run it on a VDA device.
9. Sketch a harness for your own work.

You can use `apps/workshop-pocket-cinema` for every exercise. Bring your own app only if it already runs and contains no secrets.

## Recommended four-hour path

Follow lessons 1–8, skip optional lesson 9, and finish with lesson 10. The schedule includes two 10-minute breaks and a 20-minute recovery block. Replay is the standard workshop path, so everyone can finish without a model account or Vega device.

## Choose how to run models

- **Replay:** no account, API key, model, or device required. Use this path during the workshop if setup fails.
- **Claude Code:** run a local model session with `--executor claude-cli`.
- **Strands:** use Bedrock, OpenAI, or OpenRouter with `--executor strands`.

Start with [Before You Arrive](00-before-you-arrive.md). Keep [Troubleshooting](troubleshooting.md) open during the session.

## Lessons

1. [From prompt to loop](01-from-prompt-to-loop.md)
2. [Verification and retry](02-verification-and-retry.md)
3. [Phases, checkpoints, and cost](03-phases-checkpoints-and-cost.md)
4. [Tools, skills, and executors](04-tools-skills-and-executors.md)
5. [Project memory](05-project-memory.md)
6. [Adapt your React Native app](06-adapt-your-react-native-app.md)
7. [TV as the stress test](07-tv-as-the-stress-test.md)
8. [Vega platform adapter](08-vega-platform-adapter.md)
9. [Optional: Bee context](09-bee-context-agent.md)
10. [Take it home](10-take-it-home.md)

The key-free port uses `fixtures/port-recording.json`. The Vega lifecycle uses `fixtures/vega-lifecycle.json`. Replay proves the workshop control flow and report contract; it is not proof that a physical or virtual device passed. If a live Vega step fails, continue with `checkpoints/vega-buildable/` or `checkpoints/complete/`.

Read [the live rehearsal record](live-rehearsal.md) before teaching the Vega section. The SDK build and manifest validation pass. Install, launch, logs, and screenshots still need a VDA process that remains attached outside the automation session.
