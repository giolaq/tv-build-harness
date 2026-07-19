# Past the Vibes

Build an agent harness for a React Native app, then prove it by adapting one flow for Vega TV.

Use the [interactive workshop companion](index.html) during the session. It tracks your progress, keeps every command copyable, and provides checkpoint fallbacks when a live dependency blocks you.

Model execution is replaceable: use committed replay fixtures, local Claude Code with `--executor claude-cli`, or a remote Bedrock/OpenAI/OpenRouter model through the Strands Agents SDK with `--executor strands`. The workshop packages do not use the Anthropic SDK directly.

Choose either your own working React Native project or `apps/workshop-pocket-cinema`. The workshop changes a bounded vertical slice, not an entire application. All source work happens in a generated copy.

## Four-hour path

1. [From prompt to loop](01-from-prompt-to-loop.md)
2. [Verification and retry](02-verification-and-retry.md)
3. [Phases, checkpoints, and cost](03-phases-checkpoints-and-cost.md)
4. [Tools, skills, and executors](04-tools-skills-and-executors.md)
5. [Project memory](05-project-memory.md)
6. [Adapt your React Native app](06-adapt-your-react-native-app.md)
7. [TV as the stress test](07-tv-as-the-stress-test.md)
8. [Vega platform adapter](08-vega-platform-adapter.md)
9. [Bee context agent](09-bee-context-agent.md)
10. [Take it home](10-take-it-home.md)

Complete [setup](00-before-you-arrive.md) before the session. Use [troubleshooting](troubleshooting.md) whenever a live dependency blocks you.

The canonical key-free port uses `fixtures/port-recording.json` and produces the app captured in `checkpoints/vega-buildable/app`. Live Kepler/VDA validation remains a separate evidence gate.
