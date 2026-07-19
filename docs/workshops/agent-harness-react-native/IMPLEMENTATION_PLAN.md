# Past the Vibes Workshop Implementation Plan

## Workshop identity

**Title:** Past the Vibes: Build an Agent Harness for Your React Native App

**Thesis:** Stop improving isolated prompts. Build a development loop that plans bounded work, supplies the right context, verifies outcomes, records state, and gives control back to the developer.

TV is the live stress test, not the product boundary. Focus navigation, remote input, 10-foot layouts, Vega tooling, and device feedback expose weaknesses that a simple CRUD demo would hide. Attendees should leave able to apply the same architecture to their own React Native domain.

## What changes from the Vega-only plan

The workshop no longer begins with Vega setup or promises that every attendee will complete a Vega port. It begins with a tiny general-purpose harness and builds its architecture one pressure at a time. TV adaptation becomes the capstone where attendees apply the harness to a real app.

Retain the Vega workshop plan as an advanced platform lab under `docs/workshops/vega-porting/`. Reuse its ADBT preflight, portability audit, device QA, and instructor fallbacks after the core harness exists.

## Implementation boundary

Build workshop-specific discovery, memory, Bee integration, portability checks, port phases, and Vega execution in `packages/workshop-harness`. Do not add workshop commands or phases to `packages/harness`. Production `tv-build` generates from structured inputs and does not port an arbitrary source tree, so the workshop must build and inspect its guarded app directly through the workshop Vega adapter. Keep production code unchanged and record this architectural difference explicitly.

## Learning outcomes

By the end, an attendee can:

- explain why an agent call is not yet a harness;
- decompose a development goal into focused phases with explicit inputs and outputs;
- put tools behind narrow interfaces and give each phase only the tools it needs;
- implement mechanical verification and retry with failure context;
- distinguish project memory, run state, checkpoints, recordings, and external context;
- resume a failed pipeline without repeating completed work;
- adapt the pipeline to an existing React Native app;
- use ADBT and Kepler/VDA behind a platform boundary rather than embedding Vega commands throughout the agent;
- inspect the evidence needed to trust, debug, and improve the system.

## The architecture attendees build

```text
human intent + project files + selected Bee context
                       |
                       v
                 phase context
                       |
                       v
plan -> executor -> tools/platform adapter -> verify -> retry
  |          |                                  |
  |          +------ recording/cost ------------+
  +---------------- checkpoint/report/commits
```

Use five distinct kinds of state:

| State | Purpose | Workshop representation |
| --- | --- | --- |
| Inputs | Versioned product intent | `content.json`, `brand.json`, `prompt.txt`, config |
| Project memory | Curated facts and decisions agents must preserve | `PROJECT_CONTEXT.md` with provenance |
| Run state | Current phase, result, cost, and seed | Checkpoint JSON |
| Evidence | What happened and why it passed | Recording, report, checks, commits |
| External context | Relevant prior product conversations | Explicit Bee snapshot imported into project memory |

Bee does not own pipeline correctness. A run must remain reproducible when Bee is unavailable by using a saved, reviewable context snapshot.

## Recommended format

Run this as a four-hour workshop with a short break. A three-hour version should use the prepared app and omit the advanced Vega diagnostics.

| Time | Module | Build milestone |
| --- | --- | --- |
| 00:00-00:15 | The failure of prompt babysitting | Baseline task and failure contract |
| 00:15-00:40 | Step 1: one focused agent | Prompt -> model -> files |
| 00:40-01:10 | Step 2: close the loop | Verify -> failure context -> one retry |
| 01:10-01:45 | Step 3: make a pipeline | Phases, commits, checkpoint, resume, cost |
| 01:45-01:55 | Break | Catch-up checkpoint |
| 01:55-02:25 | Step 4: make it extensible | Skills, phase context, executor interface, replay |
| 02:25-02:50 | Bring in their React Native app | Project adapter and scoped first task |
| 02:50-03:25 | TV capstone | 10-foot layout, focus, remote input, platform checks |
| 03:25-03:45 | Vega with ADBT and Kepler/VDA | Build, install, launch, inspect |
| 03:45-04:00 | Bee and the durable context loop | Select, review, save, inject, handoff |

## Teaching principles

1. **Make every new abstraction pay rent.** Start with visible failure, then add the mechanism that addresses it.
2. **Keep the diff teachable.** Each stage is a strict conceptual extension of the previous stage.
3. **Verify behavior, not prose.** Prefer files, builds, tests, focus transitions, screenshots, and exit codes.
4. **Keep humans between tempos.** Fast retries happen inside a phase; plan approval and refinement happen between runs; versioned inputs carry intent across days.
5. **Make context observable.** Show exactly which skill, project fact, conversation excerpt, and failed check entered a prompt.
6. **Offer a fallback at every lab.** No attendee should lose the architecture lesson to an SDK download or model outage.

## Proposed material layout

```text
docs/workshops/agent-harness-react-native/
  README.md
  00-before-you-arrive.md
  01-from-prompt-to-loop.md
  02-verification-and-retry.md
  03-phases-checkpoints-and-cost.md
  04-tools-skills-and-executors.md
  05-project-memory.md
  06-adapt-your-react-native-app.md
  07-tv-as-the-stress-test.md
  08-platform-adapters.md
  09-bee-context-agent.md
  10-take-it-home.md
  worksheet.md
  instructor-guide.md
  troubleshooting.md
  checkpoints/
  fixtures/
```

Base lessons 01-04 directly on `packages/mini-harness/steps/01-single-agent` through `04-skills`. Keep a single invocation shape and show the actual code diff at the start of each stage.

## Attendee paths

### Core path

Everyone builds the staged mini-harness against a small prepared React Native app. This keeps the architecture lesson consistent and gives attendees without a suitable app a complete path.

### Bring-your-own-app path

After Step 4, attendees select one bounded concern in their app: add a screen, replace a component, repair a failing test, adapt one layout, or add TV focus to one flow. Do not let the first harness task be "port my whole app."

Attendees may return to the prepared app at any checkpoint without losing the rest of the workshop.

### Platform path

- **Vega live path:** Use ADBT for Vega skills, documentation, performance, and crash tools; use Kepler CLI/VDA for build, install, launch, logs, captures, and remote input.
- **Vega replay path:** Use committed recordings and reports when no device, credentials, or compatible app is available. This is a fallback for the same lesson, not a second platform lane.

## Prepared starter app

Build a small mobile-first React Native streaming catalog called **Pocket Cinema**. Use synthetic content and repository-owned placeholder artwork so the workshop has no account, backend, trademark, or content-rights dependency.

Keep the product deliberately small:

- a touch-first home screen with a featured title and two horizontal content rails;
- a details screen with title, description, artwork, and a play action;
- local JSON data with 8-12 invented titles;
- simple in-memory navigation between home and details;
- one reusable content card and one reusable rail component;
- deterministic tests for content rendering and navigation state.

Plant realistic adaptation problems without making the code bad:

- controls respond to press/touch but have no explicit focus behavior;
- focus is not restored when returning from details;
- cards and text are sized for a handheld display;
- the focused item has no visual treatment;
- rail boundaries and back behavior are unspecified;
- one storage or image helper needs a Vega-compatible replacement;
- the package manifest lacks Vega metadata;
- verification covers rendering but not D-pad behavior.

The expected workshop adaptation is one vertical slice:

```text
launch -> initial focus on featured action
      -> move into first rail
      -> navigate cards with the D-pad
      -> open details
      -> press back
      -> restore focus to the originating card
```

Ship four forms of the starter:

1. `start`: untouched mobile-first app used for discovery and planning.
2. `audit-complete`: portability report and approved plan, no implementation.
3. `vega-buildable`: migrated project for attendees catching up before device work.
4. `complete`: reference implementation with reports, screenshots, and D-pad evidence.

Do not reveal the complete implementation during the exercise. Keep it available to instructors and as an end-of-workshop comparison.

## Implementation tasks

### WH0 - Reconcile the workshop promise with the repository

- Add the new workshop index and link it from the root README.
- Explain that `docs/course/` teaches harness concepts, this workshop builds one, and `docs/workshops/vega-porting/` is the deeper Vega lab.
- Define "focused agents" as phase-scoped executions that may share an executor, not necessarily separate models or processes.
- Define project memory narrowly as curated, reviewable facts and decisions.

**Acceptance:** The public description, agenda, repository terminology, and actual implementation make the same promises.

### WH1 - Establish a green workshop baseline

- Verify all four mini-harness steps run independently with replay.
- Add one prepared React Native app and one bounded starter task.
- Add checkpoint branches or archives after every module.
- Provide a workshop doctor that checks Node, Git, package installs, model/replay mode, Vega SDK 0.22, Kepler/VDA, and optional ADBT/Bee prerequisites.
- Publish setup instructions at least 48 hours before delivery.

**Acceptance:** A fresh participant can finish lessons 01-04 without a model key or mobile SDK.

### WH2 - Teach the single-agent baseline

- Start with a concrete change and one model call.
- Ask attendees to identify what is missing: validation, bounded scope, evidence, resumability, cost control, and reproducibility.
- Keep the first implementation small enough to read together.
- Record the prompt, response, changed files, duration, and cost as the baseline measurement.

**Acceptance:** Attendees can explain why successful code generation alone is not a trustworthy development system.

### WH3 - Add verification and retry

- Implement `file_exists` and `grep` checks first, then show where unit tests, typecheck, and builds fit.
- Feed exact failed-check output into one bounded retry.
- Demonstrate a fixture that fails once and succeeds after the retry.
- Introduce exit classes for input, product, environment, budget, and abort failures.

**Acceptance:** The retry is triggered by mechanical evidence and never loops indefinitely.

### WH4 - Add phases, checkpoints, and commits

- Load a small `phases.json` and pass prior-phase summaries forward.
- Commit after each successful phase.
- Write a checkpoint before and after each phase, including seed and cost.
- Resume from the first incomplete phase.
- Show why a plan gate sits before execution and why a budget cap can abort cleanly.

**Acceptance:** Killing the process mid-workshop and resuming is a rehearsed demo, not an untested claim.

### WH5 - Add tools, skills, and executor boundaries

- Move model invocation behind an executor interface.
- Assemble prompts from phase intent, project context, selected skills, current files, and prior failures.
- Give phases explicit tool allowlists.
- Record and replay the executor boundary.
- Compare replay, local Claude Code, and remote Strands as executor choices without requiring attendees to implement all three.

**Acceptance:** Replacing the executor does not change pipeline, verification, or checkpoint logic.

### WH6 - Add inspectable project memory

- Add a small `PROJECT_CONTEXT.md` contract containing conventions, product decisions, constraints, and provenance.
- Provide commands or helpers to propose memory additions, show a diff, and require approval before saving.
- Inject only relevant sections into each phase context.
- Keep checkpoints and recordings separate from memory.
- Add tests proving rejected or stale memory is not silently injected.

**Acceptance:** An attendee can inspect, edit, version, and remove every durable fact the harness supplies to an agent.

### WH7 - Adapt the harness to an attendee's React Native app

- Add a discovery-only phase that inventories scripts, tests, architecture, native modules, navigation, and platform targets.
- Generate a project adapter containing allowed commands and verification recipes.
- Ask the attendee to choose one bounded goal and review its plan and cost.
- Work on a guarded Git branch or copy; never experiment directly on their main branch.
- Capture unresolved assumptions rather than allowing the model to invent answers.

**Acceptance:** The first live task can fail without damaging the attendee's working tree and leaves a useful report.

### WH8 - Use TV as the stress test

- Teach 10-foot density, safe areas, readability, D-pad navigation, focus visibility, focus restoration, back behavior, and remote-only operation.
- Apply those constraints to one screen or flow, not an entire app.
- Add behavioral checks for initial focus, four directions, boundaries, overlays, scroll, back, and restored focus.
- Show how a TV skill changes phase context while the pipeline remains domain-agnostic.

**Acceptance:** The TV exercise reveals at least one defect that a build-only check would miss.

### WH9 - Add the Vega platform adapter

- Reuse the Vega portability audit and ADBT phases from the advanced plan.
- Present ADBT as the Vega knowledge and diagnostic provider, not as the harness itself.
- Keep Kepler CLI/VDA responsible for deterministic build, install, launch, logs, captures, and remote input.
- Expose these operations through one Vega adapter so phase prompts request capabilities instead of constructing shell commands.
- Report SDK version, ADBT version, device image, build, launch, screenshots, logs, behavioral checks, and unresolved platform blockers.

**Acceptance:** A phase can request `build_and_launch` through the Vega adapter without knowing the underlying Kepler/VDA command sequence.

### WH10 - Add Bee as an explicit context source

- Use Bee's developer CLI, local proxy, or MCP integration behind a `ContextProvider` interface.
- Let the attendee select conversations about the app instead of importing their entire history.
- Summarize selected conversations into candidate decisions, goals, constraints, and open questions.
- Show the candidate snapshot and require approval before writing it to project memory.
- Record conversation ids, timestamps, retrieval query, summary hash, and import time, but do not commit raw private transcripts by default.
- Make `--context-provider none` the fully supported fallback.
- Explain consent and privacy before any live retrieval.

**Acceptance:** The same run can be reproduced from the approved snapshot with Bee disconnected. Bee currently supports CLI, local proxy, and MCP access to selected context; pin the tested integration during rehearsal rather than coding against assumptions.

### WH11 - Build fixtures and instructor recovery paths

- Commit a failed verification replay, a resumed run, a TV focus defect, and a scrubbed Bee-context snapshot.
- Provide catch-up artifacts after lessons 02, 04, 07, and 09.
- Add failure cards for model outage, dependency install, Kepler build failure, VDA/device failure, ADBT unavailable, and Bee unavailable.
- Include exact reset commands and time-box each recovery attempt.

**Acceptance:** Every attendee can continue to the architectural takeaway even when all optional external systems are unavailable.

### WH12 - Rehearse, measure, and package

- Run one instructor rehearsal and two fresh-developer rehearsals.
- Measure completion time, model cost, setup failures, checkpoint usage, and where participants ask for help.
- Verify the three-hour condensed and four-hour full agendas separately.
- Package a release branch/tag with workshop code, docs, recordings, starter app, and platform extensions.
- Add a final exercise that asks attendees to replace the TV skill with one from their own domain.

**Acceptance:** At least 80% of fresh participants complete the core harness and one bounded app change; platform completion is reported separately and never hides core learning success.

## Bee integration boundary

Bee is the final layer because it demonstrates a broader lesson: useful context is not the same as uncontrolled memory. According to Bee's current developer documentation, agents can access Bee context through its CLI, a local proxy, or MCP. The workshop should use whichever path is most stable at rehearsal time and keep it behind one interface.

```ts
interface ContextProvider {
  search(query: string): Promise<ContextCandidate[]>;
  snapshot(ids: string[]): Promise<ContextSnapshot>;
}
```

The approved snapshot should look like ordinary project input:

```json
{
  "schemaVersion": 1,
  "provider": "bee",
  "capturedAt": "...",
  "sources": [{ "id": "...", "recordedAt": "..." }],
  "decisions": [],
  "constraints": [],
  "openQuestions": []
}
```

Do not inject raw transcripts wholesale. Retrieval, selection, compression, human approval, and provenance are part of the harness loop.

## What attendees leave with

- the four-stage mini-harness they built and can explain;
- a project adapter for their React Native app;
- one bounded, verified change on a guarded branch;
- a reusable project-memory file and checkpoint/report artifacts;
- a live or replayed Vega platform result;
- an optional approved Bee context snapshot;
- a worksheet for replacing TV knowledge and tools with their own domain.

## Execution order

```text
WH0 promise and terminology
  -> WH1 baseline and preflight
  -> WH2 single agent
  -> WH3 verify/retry
  -> WH4 phases/checkpoints
  -> WH5 tools/skills/executors
  -> WH6 project memory
  -> WH7 attendee app adapter
  -> WH8 TV stress test
  -> WH9 Vega adapter
  -> WH10 Bee context provider
  -> WH11 fixtures and recovery
  -> WH12 rehearsals and package
```

Write lessons alongside WH2-WH10, but freeze recordings only after their corresponding implementation and contracts are stable.

## Definition of done

1. A participant builds the harness incrementally and can explain what failure motivated every layer.
2. The workshop works key-free through replay until the bring-your-own-app lab.
3. Project memory is explicit, versioned, provenance-aware, and distinct from run checkpoints.
4. Attendee source is protected by a guarded working tree and a human-reviewed plan/cost gate.
5. TV exposes behavioral verification needs without making the harness TV-specific.
6. Vega execution is isolated behind an adapter with a stable evidence contract.
7. Bee context is selected and approved, and every run remains reproducible without Bee.
8. Every external dependency has a rehearsed fallback and catch-up checkpoint.
9. Fresh-developer rehearsals validate the agenda, costs, setup, and learning outcomes.
