# Vega Porting Workshop Implementation Plan

> **Status:** Platform-lab requirements reference. The executable handoff is `docs/workshops/agent-harness-react-native/CODEX_IMPLEMENTATION_PLAN.md`. Do not implement the proposed `tv-build vega-port` production changes below; the current workshop owns discovery and planning in `packages/workshop-harness` and delegates final Vega execution through the existing public `tv-build` CLI.

## Workshop promise

Guide a developer from an existing app to a running, remotely navigable Vega TV app by combining TV Build with Amazon Devices Builder Tools (ADBT). Teach a repeatable agentic workflow, not a one-click converter.

Use Vega SDK 0.22 for the first workshop release. Record the exact ADBT package version during the final rehearsal instead of resolving `@latest` in the room.

## What each layer does

| Layer | Responsibility |
| --- | --- |
| TV Build | Plans phases, injects project context and skills, enforces cost and verification gates, records evidence, and supports resume. |
| Coding agent | Reads the current app, edits it in place, responds to failed checks, and explains blockers. |
| ADBT | Supplies Amazon device skills, Vega documentation search, crash symbolication, Perfetto analysis, and hot-function analysis. |
| Vega SDK, Kepler CLI, and VDA | Build, install, launch, and execute the app on the target platform. |

ADBT app porting is beta. Define "port" as adapting an app's product, content, navigation, and reusable code to a Vega TV target. Do not promise binary translation or automatic conversion of every native Android dependency.

## Audience and entry paths

Target Android, React Native, web, and TV developers who can use a terminal and read TypeScript. Provide two paths:

1. **Bring your app:** Prefer a React Native TV/Fire OS app, a web TV app, or an app whose content and business logic can be reused independently of its mobile UI.
2. **Use the starter:** Use a committed source app with deliberate mobile assumptions when an attendee's app is unsuitable or setup fails.

Flag these as advanced or unsupported in the core lab: DRM, billing, authentication requiring production secrets, proprietary native SDKs, complex background services, and apps that cannot be shared with the selected model provider.

## Learning outcomes

By the end, an attendee can:

- explain the difference between a coding agent, a harness, an MCP server, a skill, and a platform CLI;
- audit an existing app for TV-porting risk before asking a model to edit code;
- turn product intent into versioned TV Build inputs and inspect the generated phase plan;
- install and verify ADBT, then use its Vega skills and MCP tools deliberately;
- build, install, launch, and inspect a Vega app on a Vega Virtual Device;
- test D-pad focus behavior mechanically and feed failures into a bounded repair loop;
- collect a report containing the seed, costs, checks, screenshots, commits, and unresolved risks.

## Three-hour agenda

| Time | Module | Attendee output |
| --- | --- | --- |
| 00:00-00:15 | Why a harness, and where ADBT fits | Mental model and completed-path preview |
| 00:15-00:30 | Environment preflight | Green readiness report or starter fallback |
| 00:30-00:50 | Portability audit | Dependency and TV-UX risk inventory |
| 00:50-01:10 | Describe the TV product | Validated inputs and reviewed plan/cost cap |
| 01:10-01:45 | Port on a guarded working copy | Vega project with migration report |
| 01:45-01:55 | Break and catch-up checkpoint | Everyone starts the device lab together |
| 01:55-02:20 | Build, install, and launch | Running app and launch evidence |
| 02:20-02:45 | D-pad, focus, and visual QA | Navigation matrix, screenshots, repaired defect |
| 02:45-03:00 | Evidence and handoff | Final report and next-action list |

Offer a separate 45-minute extension for Perfetto traces, hot functions, and crash symbolication. Performance tooling is valuable, but it must not block the core porting outcome.

## Proposed material layout

```text
docs/workshops/vega-porting/
  README.md
  00-before-you-arrive.md
  01-harness-and-adbt.md
  02-portability-audit.md
  03-describe-the-tv-product.md
  04-plan-the-port.md
  05-port-with-adbt.md
  06-build-and-run.md
  07-focus-and-remote-qa.md
  08-performance-and-crashes.md
  09-handoff.md
  worksheet.md
  instructor-guide.md
  troubleshooting.md
  fixtures/
```

Follow the course lesson shape: `The problem`, `How this repo solves it`, `Exercise`, and `Check yourself`. Add `Checkpoint` and `Fallback` sections to every hands-on lesson.

## Implementation tasks

### VW0 - Freeze scope and terminology

- Add the workshop README, learning contract, agenda, and support boundaries.
- State that the core workshop targets Vega SDK 0.22 and that ADBT is open beta.
- Explain local processing, remote documentation-search queries, telemetry controls, and the rule against entering secrets into workshop inputs.
- Link the official ADBT setup guide and distinguish ADBT commands from Kepler/VDA commands.

**Acceptance:** A new attendee can decide whether to bring an app or use the starter without asking the instructor.

### VW1 - Build a deterministic preflight

- Add `scripts/check-vega-workshop.ts` or extend the existing Vega doctor with `--workshop`.
- Check Node 18+, repository dependencies, ADBT installation/status, Vega SDK 0.22, Kepler CLI, available VDA/device, disk space, model credentials, and required ports.
- Keep two separate checks: static CLI setup via `check-status`, and an in-agent MCP check that lists ADBT tools and skills.
- Generate machine-readable and human-readable readiness reports with corrective commands.
- Document that `init-context` must run in a system terminal:

```sh
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> check-status --agent claude-code-cli
```

**Acceptance:** A clean machine can be classified as ready, repairable, or fallback-only before workshop day.

### VW2 - Add a source-app portability audit

- Add a read-only `vega_portability_audit` phase before any source edits.
- Inventory framework, dependency compatibility, mobile-only APIs, navigation, focus assumptions, media, storage, networking, permissions, deep links, lifecycle, and native modules.
- Use ADBT documentation search and the `vega-multi-tv-migration` skill where applicable.
- Emit `portability-report.json` and `portability-report.md` with `portable`, `replace`, `manual`, and `out-of-scope` classifications.
- Require the human to approve the migration plan and cost cap before execution.

**Acceptance:** Running `--plan` against the starter requires no key and clearly identifies its deliberate mobile assumptions.

### VW3 - Introduce a guarded Vega port workflow

- Add a first-class command such as:

```sh
tv-build vega-port <source-app> --inputs <workshop-inputs> --plan --json
tv-build vega-port <source-app> --inputs <workshop-inputs> --detach --yes --max-cost 10 --json
```

- Never modify the attendee's source directory. Copy it into the run workspace or create a guarded Git branch in a generated working tree.
- Reuse the existing pipeline engine, checkpoints, seed, budgets, output contract, and executor modes.
- Run phases: `portability_audit`, `tv_product_spec`, `vega_port`, `vega_setup_check`, `vega_build_loop`, `vega_qa_loop`.
- Make performance phases opt-in for the extension lab.
- Preserve useful source architecture and business logic; replace mobile UI and unsupported platform integrations explicitly.

**Acceptance:** Failure leaves the source untouched, status/resume work, and the report maps every material change to its phase commit.

### VW4 - Align the existing Vega phases with ADBT

- Audit `vega_setup_check`, `vega_build_loop`, `vega_qa_loop`, `vega_perf_trace`, and `vega_hot_functions` against the current ADBT tool and skill names.
- Prefer ADBT skills and MCP documentation for Vega knowledge.
- Use Kepler CLI/VDA for deterministic build, install, launch, logs, and remote input.
- Require `list_documents` or `search_documentation` evidence when the agent makes a Vega-specific API choice.
- Keep bounded retries and explicit budgets for device, trace, and hot-function loops.
- Record ADBT package version, SDK version, seed, device image, and tool evidence in the run report.

**Acceptance:** Prompts never invent an MCP tool, every platform command has an owner, and the setup phase fails early with a useful repair command.

### VW5 - Create the attendee lessons

- Write lessons 00-09 using the proposed material layout.
- Make the harness-versus-ADBT boundary visible in every exercise.
- Teach discovery first: inspect the current app, produce an audit, approve a plan, then edit.
- Include copy-paste commands, expected output fragments, checkpoints, time boxes, and recovery paths.
- In the focus lab, test launch focus, all four directions, back behavior, focus restoration, rail boundaries, overlays, and scrolling.
- In the handoff lab, require a remaining-risks section instead of treating a successful build as proof of a complete port.

**Acceptance:** A developer unfamiliar with the repository can complete the starter path using only the workshop docs.

### VW6 - Ship starter, checkpoints, and zero-key fallbacks

- Add a small source app with deliberate issues: touch-only controls, no focus model, mobile aspect assumptions, unsupported storage wrapper, and one awkward media dependency.
- Provide versioned catch-up checkpoints after audit, port, build, and QA.
- Commit scrubbed replay recordings, expected reports, screenshots, and a final reference app.
- Do not commit Amazon documentation responses; store citations and short findings instead.
- Provide an instructor-triggered replay/demo when credentials, network, MCP, SDK, or VDA fail.

**Acceptance:** Every module after preflight can continue from a checkpoint, and the conceptual path remains teachable without a model key.

### VW7 - Add instructor operations

- Write a minute-by-minute instructor guide with demo commands, expected costs, reset commands, and stopping points.
- Add a setup survey and a readiness deadline 48 hours before the workshop.
- Define a support ratio and pair attendees for device work.
- Add a dashboard command or collection script for readiness and checkpoint status without collecting source code.
- Prepare failure cards for MCP unavailable, SDK mismatch, VDA boot failure, build failure, no focus, and model budget abort.

**Acceptance:** Another instructor can deliver the workshop without repository archaeology.

### VW8 - Rehearse and qualify the workshop

- Run one clean-machine rehearsal and one fresh-developer rehearsal.
- Test macOS and Linux; state Windows support through WSL2 plus the documented device limitations.
- Pin the ADBT package version only after the rehearsal passes.
- Measure each module, model spend, download time, and recovery time.
- Run the secret, link, course-path, harness, and verification checks.
- Capture a complete reference report and update all expected output fragments.

**Acceptance:** At least 80% of fresh participants reach a running app within 140 minutes, and all participants can finish the evidence/handoff exercise using checkpoints.

## Attendee workflow

```sh
# Before the workshop, in a system terminal
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> init-context --agent claude-code-cli --force
npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> check-status --agent claude-code-cli

# In the repository
cd packages/harness
npx tsx src/index.ts doctor --json
npx tsx src/index.ts vega-port ../../my-app --inputs ../../my-tv-inputs --plan --json
# Show the plan, portability risks, target, and cost cap to the human.
npx tsx src/index.ts vega-port ../../my-app --inputs ../../my-tv-inputs --detach --yes --max-cost 10 --seed workshop-v1 --json
npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId> --follow
```

The `vega-port` commands above are the target interface, not a claim that they already exist.

## Evidence produced by each attendee

- validated, versioned TV product inputs;
- approved plan with cost cap and fixed seed;
- portability audit with explicit manual blockers;
- phase commits in a generated working tree;
- successful build/install/launch evidence;
- D-pad navigation matrix and screenshots;
- ADBT citations or tool evidence for Vega-specific decisions;
- final report with cost, versions, checks, unresolved risks, and next steps.

## Execution order

```text
VW0 scope
  -> VW1 preflight
  -> VW2 portability audit
  -> VW3 guarded port workflow
  -> VW4 ADBT phase alignment
  -> VW5 attendee lessons
  -> VW6 fixtures and checkpoints
  -> VW7 instructor operations
  -> VW8 rehearsals and version freeze
```

VW5 can begin after VW2's output contract is stable. Do not record fixtures until VW3 and VW4 land. Do not announce setup instructions until VW8 pins the tested ADBT version.

## Definition of done

1. An attendee can determine readiness before the event and has a documented fallback.
2. The original app is never modified; all agent edits occur in a guarded generated workspace.
3. The harness performs a read-only portability audit and human plan gate before migration.
4. ADBT provides Vega knowledge and diagnostic tools; platform CLIs provide deterministic execution.
5. The core path ends with a running app, D-pad evidence, and an honest handoff report within three hours.
6. Every live dependency has a catch-up checkpoint or replay fallback.
7. Workshop reports record ADBT, SDK, device, seed, cost, checks, and unresolved risks.
8. The workshop has passed clean-machine and fresh-developer rehearsals with a pinned toolchain.
