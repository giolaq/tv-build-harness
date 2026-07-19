# Past the Vibes

In this workshop, you build a small coding harness and use it to adapt one React Native flow for Vega TV.

Use the [workshop web app](index.html) during the session. It gives you the commands, shows what to inspect, and tracks your progress. The Markdown lessons contain the same exercises.

## What you will do

1. Run one model call and identify what it cannot prove.
2. Add checks and retry once with the exact failure.
3. Split the work into phases, commits, and checkpoints.
4. Separate skills, tools, and model executors.
5. Review project context before saving it as memory.
6. Copy and inspect a React Native app before changing it.
7. Adapt one flow for TV remote navigation.
8. Build and test the guarded copy with Vega tools.
9. Sketch a harness for your own work.

You can use `apps/workshop-pocket-cinema` for every exercise. Bring your own app only if it already runs and contains no secrets.

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

The key-free port uses `fixtures/port-recording.json`. If a live Vega step fails, continue with `checkpoints/vega-buildable/` or `checkpoints/complete/`.
