# 4. Tools, Skills, and Executors

## Goal

Separate domain instructions, system capabilities, and model access.

## Do this

1. Run Step 4 with replay:

```sh
cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --replay steps/04-skills/fixtures/demo-recording.json
```

2. Open these files:

- `skills.ts`: loads the reusable instructions selected by a phase.
- `phase-context.ts`: builds the prompt for that phase.
- `executor.ts`: passes the phase prompt and selected skills to replay, Claude Code, or Strands.
- `recorder.ts`: records model requests and responses.

3. Open `model-runtime.ts` and trace both delivery paths:
   - Claude CLI calls `injectSkillText()` and receives the full instructions in the prompt.
   - Strands wraps the instructions in `Skill`, registers `AgentSkills` through `plugins`, and lets the agent activate them with the `skills` tool.
4. Compare the teaching modules with the production modules in `packages/mini-harness/ISOMORPHISM.md`.
5. Open the `react-native-screen` and `tv-focus` skills. Notice that the target remains React Native; Step 4 changes how the agent receives domain knowledge, not what kind of app it edits.

Optional live run with Claude Code:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor claude-cli --model sonnet
```

Optional live run with Strands and Bedrock:

```sh
npx tsx steps/04-skills/index.ts run \
  steps/04-skills/fixtures/phases.json \
  --executor strands --provider bedrock \
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-west-2
```

## Read the Strands call from top to bottom

Open `packages/workshop-harness/src/port-executor.ts` and trace this sequence:

1. `new Agent()` creates the model-and-tool loop for one phase.
2. `model` receives a `BedrockModel` or `OpenAIModel` from `model-factory.ts`.
3. `systemPrompt` sets the rules that remain true for the whole invocation.
4. `tools` registers only list, read, and literal search from `port-tools.ts`.
5. Each `tool()` has a name, a model-facing description, a Zod `inputSchema`, and a deterministic `callback`.
6. `structuredOutputSchema` requires the result to match `PortOutputSchema`.
7. `printer: false` keeps Strands' console renderer off so CLI stdout remains valid JSON.
8. `agent.invoke()` starts the run with an external cancellation signal and per-invocation turn and token limits.
9. `AgentResult.structuredOutput` provides the validated patch.
10. `metrics.accumulatedUsage` provides token counts for recording and cost calculation.
11. `StructuredOutputError` turns a missing structured result into an explicit executor failure.

The mini-harness uses the same `Agent`, model providers, `AgentSkills`, `Skill`, `plugins`, `invoke()`, messages, and usage metrics. It reads `AgentResult.lastMessage` because the teaching step still expects raw JSON text. A Strands phase with a selected skill gets three turns so it can activate the skill before returning JSON; a phase without skills stays at one turn.

The full harness adds `AnthropicModel`, `agent.stream()`, and typed `AgentStreamEvent` values. Open `packages/harness/src/strands-phase-executor.ts` after the small example. Follow `modelMessageEvent`, `contentBlockEvent`, and `toolResultEvent` into logs, token updates, and the final `AgentResult`.

Read [the full Strands construct reference](strands-constructs.md) for the MCP path and the exact boundary between SDK, Zod, MCP transport, and harness code.

## Why this matters

A skill explains what matters. A tool performs a narrow action. An executor hides provider-specific model access and chooses the provider's native skill mechanism when one exists. Keeping them separate makes the pipeline easier to test and change.

The full workshop port applies the same rule with Strands Agents SDK:

- `packages/workshop-harness/src/port-tools.ts` defines three Zod-typed tools: list, read, and search.
- The tools are scoped to the guarded app. They reject `.env`, `.git`, `node_modules`, absolute paths, and paths outside the app.
- `packages/workshop-harness/src/port-contract.ts` defines the patch schema. Strands validates the model output before the harness sees it.
- `packages/workshop-harness/src/port-executor.ts` limits each phase to eight turns, 40,000 total tokens, and ten minutes.
- The agent has no write or shell tool. `port-pipeline.ts` validates paths, writes files, runs checks, retries once, and commits passing work.

This is the main tool-design rule: give an agent the smallest capability needed for its current concern. Keep irreversible actions in deterministic harness code.

## You are done when

You can show where to change domain knowledge without changing the pipeline, and where to change model providers without changing verification.

## If blocked

Use replay. The architecture is visible without a live model.
