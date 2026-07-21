# Instructor Guide

## Before the workshop

1. Send [setup](00-before-you-arrive.md) 48 hours early.
2. Ask each attendee to report one status: **live ready**, **replay ready**, or **blocked**.
3. Test every replay and checkpoint from a clean clone.
4. Rehearse ADBT `1.0.5`, Vega SDK `0.22.5875`, and the target VDA image.
5. Read [the latest live rehearsal](live-rehearsal.md). Do not present the device path as ready until VDA remains attached.
6. Start VDA in a separate system terminal, keep it open, and confirm `vega virtual-device status` plus `vega exec vda devices -l` before attendees arrive.
7. Keep the completed TV app hidden until the TV exercise ends.

Open with this boundary: Strands supplies the model loop, typed tools, structured output, MCP client, limits, and metrics. The harness supplies the phases, approval, writes, checks, retry, commits, budget, and evidence. Show `port-tools.ts`, `port-contract.ts`, and `context-providers/adbt.ts` before any live model demo.

During lesson 4, trace one mini-harness skill through both routes: full-text prompt injection for Claude CLI, then `Skill` → `AgentSkills` → `plugins` → `skills` tool for Strands. Continue with provider `Model`, `Agent`, `systemPrompt`, `invoke()` limits, and `AgentResult` metrics. Next show what the full harness adds: `AnthropicModel`, `stream()`, and `AgentStreamEvent`. During lesson 6, add `tool()` schemas and callbacks, structured output, `McpClient`, `listTools()`, `callTool()`, and `disconnect()`. State that Zod, native `AbortSignal`, and `StdioClientTransport` are adjacent dependencies, not Strands APIs. Keep [the construct reference](strands-constructs.md) open for questions.

## Four-hour schedule

| Time | Attendees do | If blocked |
| --- | --- | --- |
| 00:00 | Set up, choose an app, and run doctor | Use Pocket Cinema and replay |
| 00:10 | Lesson 1: run one model call and list missing evidence | Show the Step 1 replay |
| 00:25 | Lesson 2: trace a failed check into one retry | Read the retry recording together |
| 00:45 | Lesson 3: pause after one phase, inspect the checkpoint, and resume | Use the resume fixture |
| 01:10 | Lesson 4: trace skills, executors, and recording | Use Step 4 replay |
| 01:30 | **Break** | Keep it a full 10 minutes |
| 01:40 | Lesson 5: review and apply a synthetic memory proposal | Use the copied fixture |
| 01:55 | Lesson 6: trace runtime ADBT context into the guarded Pocket Cinema port | Use the recorded ADBT context and Vega-buildable checkpoint |
| 02:30 | Lesson 7: run the focus state checks and inspect a failure | Use the focus fixture |
| 02:50 | **Break** | Keep it a full 10 minutes |
| 03:00 | Lesson 8: replay the complete Vega lifecycle | Use the complete checkpoint |
| 03:25 | Lesson 10: draft a harness for another domain | Use the worksheet example |
| 03:40 | Recovery, questions, and optional live Vega or Bee demo | Stay with replay if setup is slow |

Lesson 9, Bee context, is optional. Run it only during the final recovery block and only if setup, consent, and time allow.

For lesson 6, show the five boundaries on screen: native ADBT MCP connection, approved workflow lookup, `vega_port` prompt context, `NextSteps.md`, and the verified phase commit. Use `--adbt-live` with the recorded model response to demonstrate the real MCP call without spending model budget.

The core path takes 200 minutes. Two breaks and a 20-minute recovery block bring the session to four hours.

## Teaching rule

State four things before each exercise:

1. What attendees will run.
2. What file or output they will inspect.
3. What proves the exercise is complete.
4. Which replay or checkpoint to use if blocked.

Do not let model, device, or account setup consume the workshop. Try one repair for no more than 10 minutes, then move to the fallback.

## What to measure

Track these separately:

- core harness lessons completed;
- guarded React Native port completed;
- TV behavior understood;
- live Vega run completed;
- fallback used;
- time and model cost;
- help requests.

The main learning outcome must not depend on a live model, Vega device, or Bee.

## Live Vega evidence

Keep replay and live results visually separate. Replay proves command order, stop conditions, and report shape. A live claim requires all of these:

- SDK `0.22.5875` reported;
- VDA listed as attached;
- manifest validation and `.vpkg` build passed;
- install and launch passed;
- device logs were saved;
- a real screenshot was pulled;
- the focus transition suite passed.

If any item is missing, say which boundary failed and continue with replay.
