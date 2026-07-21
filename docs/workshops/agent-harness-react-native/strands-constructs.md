# Strands Constructs Used in This Workshop

This is a code-reading guide, not a list of everything Strands Agents SDK can do. The production workshop harness pins `@strands-agents/sdk` `1.10.0`; the staged mini-harness and general TV Build harness currently pin `1.7.0`. Both use bounded agents around React Native work, while the production workshop agent inspects a guarded app and proposes a Vega patch.

Use these files while reading this guide:

- `packages/workshop-harness/src/port-executor.ts`
- `packages/workshop-harness/src/model-factory.ts`
- `packages/workshop-harness/src/port-tools.ts`
- `packages/workshop-harness/src/port-contract.ts`
- `packages/workshop-harness/src/context-providers/adbt.ts`
- `packages/mini-harness/model-runtime.ts`
- `packages/harness/src/strands-phase-executor.ts`
- `packages/harness/src/phase-context.ts`
- `packages/harness/src/model-factory.ts`

## The live Strands path

```text
phase prompt
  -> Agent
     -> provider Model
     -> list/read/search tools
     -> structured patch
  -> AgentResult
     -> token metrics
     -> recorder
  -> harness validates paths, writes, checks, retries, and commits
```

## Agent construction

| Construct | Meaning in this workshop |
| --- | --- |
| `Agent` | Runs the model-and-tool loop for one phase. It decides when to call the registered read tools and when to return the final patch. |
| `name` | Gives the phase agent a stable identity such as `workshop-vega_port`. This helps logs and traces identify the run. |
| `description` | States the agent's role in plain language. It also keeps the instance understandable if it is inspected or reused. |
| `model` | Supplies the provider adapter created by `model-factory.ts`. The pipeline does not depend directly on Bedrock or OpenAI calls. |
| `systemPrompt` | Sets durable operating rules for the invocation: inspect first, use evidence, and return a complete patch. Phase-specific work remains in the user prompt. |
| `tools` | Registers the capabilities the model may call. The port agent receives only list, read, and literal search. |
| `structuredOutputSchema` | Requires the final response to match `PortOutputSchema`: a summary and a map of complete file contents. |
| `printer: false` | Disables Strands' automatic console output. The workshop CLI reserves stdout for its versioned JSON contract. |

## Model providers

`Model` is the common Strands model interface. `model-factory.ts` creates one of these implementations:

| Construct | Use |
| --- | --- |
| `BedrockModel` | Calls an Amazon Bedrock model with an explicit model id, region, and output-token limit. |
| `OpenAIModel` | Calls OpenAI with an explicit model id and output-token limit. |
| `OpenAIModel` with `clientConfig.baseURL` | Calls OpenRouter through its OpenAI-compatible endpoint. There is no separate OpenRouter class in this workshop. |

The executor chooses the model from `--provider`, `--model`, and `--region`. Verification does not change when the provider changes.

## Typed tools

`port-tools.ts` creates each project tool with Strands `tool()`.

| Field or type | Use |
| --- | --- |
| `tool()` | Wraps a TypeScript callback as a model-callable tool. |
| `name` | Provides the stable identifier the model requests, such as `read_project_file`. |
| `description` | Tells the model when to use the tool and what boundary it has. |
| `inputSchema` | Uses a Zod schema to validate model-supplied arguments before the callback runs. Zod also gives the callback a typed input. |
| `callback` | Runs the deterministic list, read, or search implementation. |
| `InvokableTool` | Type used for the list returned to `Agent`. It is a compile-time TypeScript contract. |
| `JSONValue` | Restricts values crossing tool and MCP boundaries to JSON-compatible data. |

The callbacks add boundaries beyond schema validation. They reject absolute paths, parent traversal, symlinks, `.git`, `.env`, `node_modules`, binary files, large files, and paths outside the guarded app.

The agent receives no write tool and no shell tool. Strands can support those capabilities, but this harness intentionally keeps irreversible actions in the pipeline.

## Structured output

`PortOutputSchema` is a Zod schema passed to Strands as `structuredOutputSchema`.

```text
{
  summary: string,
  files: Record<relativePath, completeFileContents>
}
```

Strands asks the model for that shape, validates the result, and can retry with schema feedback when the response is invalid. After invocation:

- `AgentResult.structuredOutput` contains the validated value.
- `StructuredOutputError` represents failure to produce structured output.
- The executor parses the value again at its own boundary before serializing it.
- The harness validates every proposed path before writing any file.

Structured output validates shape. It does not prove that a patch is correct, safe, buildable, or suitable for TV. The phase checks provide that separate evidence.

## Invocation controls

The workshop calls:

```text
agent.invoke(prompt, {
  cancelSignal,
  limits: { turns: 8, totalTokens: 40000 }
})
```

| Construct | Use |
| --- | --- |
| `agent.invoke()` | Starts one agent run and resolves to an `AgentResult`. |
| `limits.turns` | Caps model-and-tool loop iterations. The mini-harness allows three turns when a phase has a skill and one otherwise. |
| `limits.totalTokens` | Caps total token use for that invocation. |
| `cancelSignal` | Lets an external abort signal stop the invocation at cancellation points. The workshop supplies a ten-minute native `AbortSignal.timeout()`. |
| `AgentResult` | Carries structured output, messages, stop information, and metrics. |
| `metrics.accumulatedUsage` | Reports input and output tokens accumulated across the invocation. |
| `lastMessage` | Used only by the mini-harness live example, which reads raw text instead of using a structured-output schema. |

Strands reports usage. The harness applies configured token prices, enforces the run budget, and records the result. Cost policy is not delegated to the model.

## Skill delivery in the mini-harness

Step 4 loads the same phase skill before choosing an executor:

| Executor | Delivery |
| --- | --- |
| Claude CLI | `injectSkillText()` appends the complete skill instructions to the subprocess prompt. Claude CLI has no in-process Strands plugin. |
| Strands | Each loaded instruction becomes a Strands `Skill`. `AgentSkills` is registered through `plugins`, injects skill metadata, and provides the `skills` activation tool for progressive disclosure. |
| Replay | No model runs. The recorded response replaces either live delivery path. |

The base phase prompt contains no skill body, so a Strands invocation does not receive duplicate instructions. See `packages/mini-harness/model-runtime.ts` and `packages/mini-harness/tests/skill-delivery.test.ts`.

## Constructs added by the full harness

The mini-harness already demonstrates SDK-managed skills. TV Build's full Strands executor adds another model provider and streaming without changing the pipeline boundary.

| Construct | Use in the full harness |
| --- | --- |
| `AnthropicModel` | Adds direct Anthropic API access behind the same `Model` interface used for Bedrock and OpenAI-compatible providers. |
| `agent.stream()` | Starts the same agent loop as `invoke()`, but returns events while the phase is running and an `AgentResult` when it ends. |
| `AgentStreamEvent` | The event union consumed by the executor. `modelMessageEvent` marks model turns, `contentBlockEvent` exposes streamed text or tool requests, and `toolResultEvent` carries tool output. |

The full harness creates its write, edit, shell, Git, search, and ADBT bridge capabilities with the same `tool()` construct. Those callbacks are project code, not privileged SDK behavior. The pipeline still owns phase order, budgets, retries, checkpoints, verification, and reporting.

## MCP constructs

The harness uses Strands `McpClient` directly to load ADBT guidance before `vega_port`.

| Construct | Use |
| --- | --- |
| `McpClient` | Connects to a trusted MCP server and exposes its tools as executable objects. |
| `applicationName` and `applicationVersion` | Identify TV Build Workshop to the server during initialization. |
| `listTools()` | Connects lazily and returns the server's tool objects. The harness requires `list_documents` and `read_document`. |
| `callTool(tool, args, { signal })` | Calls one discovered tool with JSON arguments and a cancellation signal. |
| `JSONValue` | Defines the JSON-compatible MCP argument and result boundary. |
| `disconnect()` | Closes the server connection and child process. It runs in `finally`, including error paths. |

`StdioClientTransport` is not a Strands construct. It comes from the official Model Context Protocol TypeScript SDK. It starts pinned ADBT as a child process and carries MCP messages over stdin and stdout.

Strands also supports registering an `McpClient` directly as an agent tool source. This workshop does not do that. The harness calls ADBT itself, selects two approved migration workflows, stores their names and hashes, and injects only those excerpts into `vega_port`.

## What the harness owns

These constructs are outside Strands:

| Construct | Owner |
| --- | --- |
| Phase order, dependencies, retry policy, and resume | Workshop harness |
| Human plan approval and cost cap | Workshop harness |
| Zod schema definitions | Zod plus workshop code |
| MCP stdio transport | Model Context Protocol SDK |
| Protected file writes and rollback | Workshop harness |
| Build, focus, and platform checks | Workshop harness |
| Git commits, checkpoints, recordings, replay, and reports | Workshop harness |
| Token price calculation | Workshop harness |

## SDK features not used here

This repository does not use Strands hooks, Graph, Swarm, agent-as-tool, session managers, memory managers, custom conversation managers, or SDK-provided write and shell tools.

That is deliberate. A bounded `Agent` is enough for the uncertain part. Deterministic TypeScript handles the workflow around it.
