# Codex Handoff: Past the Vibes Workshop

## Objective

Implement all code, examples, documentation, fixtures, checkpoints, and instructor artifacts required to deliver **Past the Vibes: Build an Agent Harness for Your React Native App**.

Attendees build a harness incrementally, apply it to either their own React Native app or the prepared Pocket Cinema app, adapt one vertical slice for TV, run it on Vega, and optionally import approved product context from Bee.

Implement workshop behavior outside `packages/harness`. Extend the staged teaching code into `packages/workshop-harness`, port the guarded source there, and execute its Vega package through the workshop adapter. Do not import production-harness internals or add workshop commands to its CLI.

The harness architecture is reusable. The only live platform path in this workshop is **Vega**:

- ADBT supplies Vega skills, documentation, performance analysis, and crash diagnostics.
- Kepler CLI and Vega Virtual Device (VDA) perform build, install, launch, logs, capture, and remote input.
- Do not add an Android lane, Android CLI lab, Gradle lab, or Android-specific workshop fallback.

## Baseline to verify

Before editing, verify these paths still exist:

```text
packages/mini-harness/steps/01-single-agent/
packages/mini-harness/steps/02-verify-loop/
packages/mini-harness/steps/03-phases/
packages/mini-harness/steps/04-skills/
packages/harness/src/pipeline-engine.ts
packages/harness/src/phase-context.ts
packages/harness/src/checkpoint.ts
packages/harness/src/recorder.ts
packages/harness/src/vega-tools.ts
packages/harness/src/tools/vega-build.ts
packages/harness/prompts/vega_*.md
examples/vega-cooking/
```

Run the green baseline:

```sh
cd packages/mini-harness && yarn install --frozen-lockfile && yarn typecheck
cd packages/harness && yarn install --frozen-lockfile && yarn typecheck && yarn test
cd packages/verification && yarn install --frozen-lockfile && yarn test
```

If the staged mini-harness or named real-harness modules have moved, update this plan's paths in the first PR before implementing behavior.

## Working rules

1. Use one PR per task ID. Branches: `workshop/<task-id>-short-slug`.
2. Paste each task's acceptance checklist into its PR and check it honestly.
3. Keep prompts, skills, fixtures, and source changes scoped to the task that owns them.
4. Do not modify `packages/harness` source, prompts, skills, package metadata, or tests. Documentation links are the only permitted production-harness change.
5. Every emitted JSON object carries `schemaVersion: 1`.
6. Every live model/device/Bee criterion may be marked `[deferred: needs key/device/Bee]`; always ship the fake, replay, or checkpoint path.
7. Never commit secrets, raw private Bee transcripts, copyrighted catalog data, or owner-hosted media.
8. Never modify an attendee's source app. Work in a copied Git workspace under the run directory.
9. Pin Vega SDK 0.22 for the first workshop. Resolve and pin the tested ADBT package version during rehearsal; never use `@latest` in the live workshop.
10. Treat the production `tv-build` CLI as an external public interface. Do not import from `packages/harness/src`.
11. If the workshop exposes a genuine production gap, file it separately with evidence. Do not solve it inside this workstream.

## Target repository layout

```text
apps/workshop-pocket-cinema/
  README.md
  package.json
  src/
  tests/
  assets/
  workshop-brief.md

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
  08-vega-platform-adapter.md
  09-bee-context-agent.md
  10-take-it-home.md
  worksheet.md
  instructor-guide.md
  troubleshooting.md
  checkpoints/
    audit-complete/
    vega-buildable/
    complete/
  fixtures/
    verify-retry/
    resume/
    focus-failure/
    bee-context/

packages/workshop-harness/
  package.json
  README.md
  src/
    index.ts
    project-memory.ts
    source-app.ts
    portability-audit.ts
    workshop-doctor.ts
    platform/
      vega.ts
    context-providers/
      types.ts
      file.ts
      bee.ts
  skills/
    react-native-project-discovery/SKILL.md
    react-native-tv-adaptation/SKILL.md
    vega-portability-audit/SKILL.md
  tests/
  fixtures/

scripts/
  check-workshop.ts
  package-workshop-checkpoint.ts
```

Adjust file placement to established repository conventions, but preserve the ownership boundaries and names exposed in documentation.

## Command contract to implement

```sh
# All workshop commands belong to the teaching package
cd packages/workshop-harness
npx tsx src/index.ts doctor --json

# Inspect source without changing it
npx tsx src/index.ts plan ../../my-app --inputs ../../my-tv-inputs --json

# Execute in a generated guarded workspace
npx tsx src/index.ts run ../../my-app --inputs ../../my-tv-inputs \
  --detach --yes --seed workshop-v1 --max-cost 10 --json

npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId> --follow

# Curated project memory
npx tsx src/index.ts memory show ../../my-tv-inputs --json
npx tsx src/index.ts memory propose ../../my-tv-inputs --from ../../candidate-context.json --json
npx tsx src/index.ts memory apply ../../my-tv-inputs --from ../../candidate-context.json --yes --json

# Optional Bee source; file snapshots remain the reproducible input
npx tsx src/index.ts context bee search "Pocket Cinema product decisions" --json
npx tsx src/index.ts context bee snapshot <conversationId...> --out ../../candidate-context.json --json

# Final platform execution operates on the guarded port
npx tsx src/index.ts vega-run <workshopRunId> --plan --json
npx tsx src/index.ts vega-run <workshopRunId> --yes --json
```

`vega-run` must operate on `out/<runId>/app/apps/vega` through array-argument Kepler/VDA subprocesses and emit a versioned platform result. Production `tv-build` remains unchanged because its input-generated application flow is not a source-porting API.

## Production harness boundary

Workshop PRs may:

- read production documentation and public CLI help while designing lessons;
- inspect production `tv-build` CLI behavior for architectural comparison;
- add a root README link to the workshop.

Workshop PRs may not:

- edit `packages/harness/src`, `packages/harness/prompts`, or production skills;
- import a production source module;
- add workshop-only phases or commands to `tv-build`;
- copy production orchestration into the workshop package;
- weaken production tests to make the workshop pass.

When production would benefit from a capability proven by the workshop, file a separate issue containing evidence and the proposed public contract. Do not couple the workshop release to that issue.

## Core data contracts

### Project memory

Store approved project facts in a human-readable `PROJECT_CONTEXT.md` plus a machine-readable provenance sidecar:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "entries": [
    {
      "id": "decision-home-hero",
      "section": "product_decision",
      "text": "The featured action receives initial focus.",
      "source": { "kind": "human", "reference": "workshop" },
      "approvedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

Allowed sections: `product_decision`, `constraint`, `convention`, `open_question`. Never treat an open question as a decision.

### External context snapshot

```json
{
  "schemaVersion": 1,
  "provider": "bee",
  "capturedAt": "2026-01-01T00:00:00.000Z",
  "query": "Pocket Cinema product decisions",
  "sources": [{ "id": "conversation-id", "recordedAt": "..." }],
  "decisions": [],
  "constraints": [],
  "openQuestions": [],
  "summaryHash": "sha256:..."
}
```

Do not store raw transcript text by default. Candidate context does not enter prompts until a human applies the proposal.

### Portability report

```json
{
  "schemaVersion": 1,
  "source": { "path": "...", "gitCommit": "..." },
  "target": { "platform": "firetv-vega", "sdk": "0.22" },
  "summary": { "portable": 0, "replace": 0, "manual": 0, "outOfScope": 0 },
  "findings": [
    {
      "area": "navigation",
      "classification": "replace",
      "evidence": "src/navigation.tsx",
      "recommendation": "Add explicit focus and back behavior."
    }
  ],
  "proposedPhases": [],
  "manualBlockers": []
}
```

### Vega platform result

```json
{
  "schemaVersion": 1,
  "sdkVersion": "0.22",
  "adbtVersion": "...",
  "device": { "name": "...", "image": "..." },
  "build": { "ok": true, "artifact": "...", "durationMs": 0 },
  "launch": { "ok": true, "packageId": "..." },
  "checks": [],
  "screenshots": [],
  "logFiles": [],
  "blockers": []
}
```

## Tasks

### W01 - Workshop skeleton and scope

**Files:** workshop `README.md`, lesson stubs, root README links, existing implementation plans.

- Create the target documentation tree.
- State the four-hour and condensed three-hour agendas.
- Explain that attendees may bring a React Native app or use Pocket Cinema.
- Promise one bounded vertical slice, not automatic whole-app conversion.
- State that Vega is the only live platform path.
- Link the official ADBT setup guide and current Bee developer documentation.
- Add privacy and source-code-sharing warnings before setup instructions.

**Acceptance:** all links resolve; no Android lane appears anywhere in the workshop tree; `check-course-paths.ts` or its workshop equivalent passes.

### W02 - Pocket Cinema source app

**Files:** `apps/workshop-pocket-cinema/**`.

Build a readable mobile-first React Native app with:

- home and details screens;
- featured content and two horizontal rails;
- 8-12 invented titles loaded from local JSON;
- repository-owned simple artwork or generated assets with documented provenance;
- reusable `ContentCard` and `ContentRail` components;
- in-memory navigation and deterministic tests;
- no login, backend, DRM, billing, analytics, or secrets.

Plant these adaptation gaps intentionally:

- touch/press works but explicit focus behavior is absent;
- no focus ring or focus restoration;
- mobile density and typography;
- unspecified rail boundaries and back behavior;
- one isolated helper requiring Vega replacement;
- no Vega manifest metadata;
- rendering tests but no D-pad tests.

Add `workshop-brief.md` describing purpose, audience, target flow, essential behavior, replaceable behavior, known constraints, and verification.

**Acceptance:** source app installs, typechecks, and tests; rights/link guard passes; a screenshot demonstrates a polished mobile app; none of the intended TV gaps accidentally has a completed solution.

### W03 - Mini-harness teaching fixtures

**Files:** `packages/mini-harness/steps/**/fixtures`, workshop lessons 01-04.

- Keep the same run/replay invocation across all four steps.
- Add Pocket Cinema-flavored prompts and recordings to Steps 1 and 2.
- Add recordings for Steps 3 and 4 using the existing `RecordedTurn` shape.
- Ensure Step 2 visibly fails a check and consumes its text during retry.
- Ensure Step 3 demonstrates interruption and resume.
- Ensure Step 4 demonstrates skill injection and executor replay.
- Add code-diff callouts showing only the new concept at each step.

**Acceptance:** all steps replay without a model key; live mode remains supported; lesson commands are copy-paste clean; mini-harness remains within its teaching-oriented line caps.

### W04 - Explicit project memory

**Files:** `packages/workshop-harness/src/project-memory.ts`, workshop CLI wiring, tests, lesson 05.

- Parse and validate the project-memory contracts.
- Implement `show`, `propose`, and approval-gated `apply`.
- Render approved entries into `PROJECT_CONTEXT.md` and preserve provenance in JSON.
- Select relevant entries by phase section/tags without a model call where possible.
- Inject selected entries through the workshop package's phase-context assembly with a visible heading.
- Record selected memory entry ids in the phase/run report.
- Keep project memory separate from checkpoint, recording, and generated output.

**Acceptance:** proposals never affect prompts before approval; rejected/stale entries are excluded; open questions are labeled; JSON errors have `code`, `message`, and `hint`; replay works without memory-provider access.

### W05 - Source-app discovery and guarded workspace

**Files:** workshop `source-app.ts`, workshop discovery skill, tests, lesson 06.

- Inspect package scripts, framework/version, navigation, tests, native modules, platform files, and Git state without editing.
- Refuse a missing/non-project path with exit 1 and a corrective hint.
- Copy the source into `out/<runId>/app` preserving the source commit metadata.
- Initialize or reuse Git only inside the copied workspace.
- Never copy `.env`, credentials, build caches, `node_modules`, or known secret files.
- Record ignored paths and source commit in the run spec.
- Produce a proposed command/check allowlist for human review.

**Acceptance:** source checksums and `git status` remain unchanged after success, failure, abort, and resume; paths containing spaces work; secret fixtures are excluded.

### W06 - Workshop portability audit and plan gate

**Files:** workshop `portability-audit.ts`, config/types, audit skill/prompt, tests.

- Add the read-only `vega_portability_audit` phase.
- Classify framework, dependencies, navigation, focus, media, storage, networking, permissions, lifecycle, native modules, and manifest needs.
- Use ADBT documentation search when available and record citations/tool evidence.
- Emit JSON and Markdown portability reports.
- Implement the workshop `plan` command with phases, checks, seed, estimate, cap, manual blockers, and source/output paths.
- Require `--yes` in JSON execution mode.
- Default live workshop cap to $10 and fixed seed `workshop-v1` in documented commands, while allowing overrides.

**Acceptance:** `--plan` works against Pocket Cinema without a key using its fixture; unsupported apps receive honest manual/out-of-scope findings; no edit happens before approval.

### W07 - Teaching pipeline and production-harness handoff

**Files:** `packages/workshop-harness/**`, tests.

Run these bounded phases:

```text
source_discovery
  -> vega_portability_audit
  -> tv_product_spec
  -> vega_port
  -> vega_setup_check
  -> vega_build_loop
  -> vega_qa_loop
```

- Evolve the Step 4 teaching architecture into the workshop package with its own readable pipeline, phase context, executor, checkpoint, budget, seed, recorder, detach/status, and commit behavior.
- Mirror production concepts and module names where useful, but do not import production source modules.
- Preserve reusable product/data logic and explicitly replace unsupported platform code.
- Give each phase the narrowest skills and tools it needs.
- Commit only after phase checks pass.
- On failure, leave the generated workspace clean and resumable.
- Produce a validated TV Build input directory from the teaching pipeline.
- Keep performance diagnostics as an opt-in ADBT extension after the core guarded app builds.

**Acceptance:** fake executors cover success, verify/retry, budget abort, resume, and product failure; run events remain valid schemaVersion 1 NDJSON; source app is unchanged; an integration test uses a fake `tv-build` binary; `rg "packages/harness/src" packages/workshop-harness` finds no source import.

### W08 - ADBT and Vega platform adapter

**Files:** workshop `platform/vega.ts`, `workshop-doctor.ts`, workshop prompts/skills, tests, lesson 08.

- Teach capabilities for `build`, `install`, `launch`, `logs`, `capture`, `remote_input`, and `device_status` through one workshop adapter.
- For the live capstone, run the guarded `apps/vega` package through the workshop adapter. Unit tests use fake Kepler/VDA executables.
- Use ADBT MCP tools only by their documented names.
- Prefer ADBT skills/documentation for Vega decisions.
- Record SDK, ADBT, VDA image, commands, durations, outputs, and evidence.
- Add per-command timeouts and process-group cleanup.
- Implement workshop-package doctor checks for Node, production `tv-build`, ADBT status, Vega SDK 0.22, Kepler CLI, VDA/device, model/replay mode, ports, and disk.
- Use the same native Strands `McpClient` path in doctor and the port. Discover tools, require `list_documents` and `read_document`, and disconnect after capture.

The harness owns the MCP connection. Pre-workshop setup checks it without changing agent configuration:

```sh
cd packages/workshop-harness
npx tsx src/index.ts doctor --replay --adbt-live --json
```

**Acceptance:** fake CLIs exercise every capability and timeout; no shell-concatenated command; doctor classifies ready/repairable/replay-only; prompt/tool names match the pinned ADBT version.

### W09 - Behavioral TV verification

**Files:** workshop verification checks, fixtures, lesson 07, workshop TV prompt.

Implement evidence for this flow:

```text
launch -> featured action focused
       -> enter first rail
       -> move left/right and across boundaries
       -> open details
       -> press back
       -> originating card focused again
```

- Verify focus visibility, uniqueness, initial focus, directional movement, boundaries, scroll, overlay escape, back, and restoration.
- Capture screenshots with stable names and associate them with steps.
- Feed exact failed transitions into one bounded repair retry.
- Distinguish environment/device failure from product behavior failure.
- Include manual accessibility/readability observations without claiming they are mechanical checks.

**Acceptance:** committed fixture fails at least one focus transition before repair; report shows the failure entering retry context; final Pocket Cinema checkpoint passes all required transitions.

### W10 - Bee context provider

**Files:** `packages/workshop-harness/src/context-providers/**`, workshop CLI, tests, lesson 09.

- Define a provider-neutral `ContextProvider` interface.
- Implement a file provider first for deterministic testing and replay.
- Implement Bee through its tested CLI, local proxy, or MCP path; choose one during rehearsal and document the reason.
- Search and select conversations explicitly; never import all history.
- Convert selected material into a candidate snapshot with decisions, constraints, and open questions.
- Hash the normalized summary and record source ids/timestamps/query.
- Require project-memory proposal approval before injection.
- Avoid raw transcripts in Git, reports, logs, and recordings.
- Support `--context-provider none` and file snapshots as first-class modes.

**Acceptance:** fake Bee executable/server covers success, unavailable, malformed, timeout, and privacy filtering; approved snapshot works with Bee disconnected; raw transcript sentinel never appears in committed artifacts.

### W11 - Documentation and exercises

**Files:** workshop lessons 00-10, worksheet, troubleshooting.

Use this shape for each hands-on lesson:

```text
The failure -> The mechanism -> Build it -> Run it -> Inspect the evidence
Checkpoint -> Fallback -> Check yourself
```

- Keep exercises bounded to 20-35 minutes.
- State cost, credentials, device, and network requirements at the top.
- Include exact commands and expected output fragments.
- Explain the distinction among inputs, memory, checkpoint, recording, and external context.
- Show how to use an attendee's app and how to switch to Pocket Cinema.
- Include no Android lane or Android-specific exercise.
- End with an exercise replacing TV knowledge/checks with the attendee's own domain.

**Acceptance:** path checker validates mentioned files; commands are tested by a script where possible; every live exercise has replay/checkpoint fallback; no undocumented command appears.

### W12 - Checkpoints, recordings, and artifacts

**Files:** workshop `checkpoints/`, `fixtures/`, scripts, CI.

Create:

- `start`: mobile Pocket Cinema source;
- `audit-complete`: source plus portability report and approved plan;
- `vega-buildable`: generated app ready for device exercises;
- `complete`: final app, report, screenshots, and focus evidence;
- verify/retry recording;
- interrupted/resumed recording;
- focus-failure and repaired recording;
- scrubbed Bee candidate and approved snapshot.

- Package checkpoints deterministically with checksums and source commit.
- Scrub paths, tokens, credentials, private conversation text, and owner domains.
- Keep total workshop fixtures reasonably small; optimize screenshots.
- Replay every recording in CI.
- Add a fixture regeneration policy to the PR template.

**Acceptance:** fixtures work key-free from a fresh clone; complete checkpoint report totals match recording totals; secret/domain guards pass; no raw Amazon documentation response is committed.

### W13 - Instructor operations

**Files:** `instructor-guide.md`, troubleshooting, readiness form/template.

- Provide minute-by-minute four-hour and condensed three-hour scripts.
- Include opening demo, code-reveal points, expected questions, break/catch-up point, and closing exercise.
- Add failure cards for install, model, Kepler build, VDA/device, ADBT, Bee, budget, and stale process failures.
- Include exact reset and checkpoint-switch commands.
- State expected live costs and downloads after rehearsal.
- Add a 48-hour readiness workflow and a privacy-safe readiness summary.
- Define which complete artifacts remain instructor-only until the exercise ends.

**Acceptance:** a second instructor can deliver the workshop from the guide without reading harness internals.

### W14 - Rehearsal, quality gate, and workshop release

- Run one clean-machine rehearsal.
- Run two fresh-developer rehearsals: one with Pocket Cinema and one with a suitable external React Native app.
- Test the replay-only path separately.
- Measure setup time, module time, completion, cost, recovery use, and help requests.
- Pin the tested ADBT version after the rehearsal.
- Update expected outputs, costs, screenshots, and known limitations.
- Run all repository checks and package a workshop tag/release artifact.

**Acceptance:** at least 80% of fresh participants finish the core harness and one verified TV adaptation; live Vega completion and optional Bee completion are reported separately; no setup command resolves an unpinned workshop dependency.

## Required tests

Add focused tests for:

- project-memory validation, approval, rejection, provenance, and injection;
- source copy safety, secret exclusions, spaces in paths, and unchanged source;
- portability classifications and plan output;
- guarded execution success/failure/abort/resume;
- Vega capability command arrays, timeouts, cleanup, and evidence parsing;
- ADBT schema/tool-version mismatch;
- TV focus transition reports and retry context;
- Bee/file providers, selection, timeout, privacy filter, and disconnected replay;
- all workshop JSON contracts and error hints;
- checkpoint packaging and fixture replay.

Do not rely on network, model, Bee, SDK, or device access in unit tests. Use fake executables, temporary Git repositories, and committed recordings.

## PR verification gate

Before every PR:

```sh
cd packages/mini-harness && yarn typecheck
cd packages/workshop-harness && yarn typecheck && yarn test
cd packages/harness && yarn typecheck && yarn test
cd packages/verification && yarn test
packages/harness/node_modules/.bin/tsx scripts/check-course-paths.ts
packages/harness/node_modules/.bin/tsx scripts/scrub.ts --check docs examples
```

Run starter-app tests when touched. For workshop CLI changes, paste the affected `--help`, human output, and `--json` output into the PR. Confirm the PR contains no production-harness source changes.

## Suggested PR order

```text
W01 skeleton
 -> W02 Pocket Cinema
 -> W03 mini-harness fixtures
 -> W04 project memory
 -> W05 source discovery/workspace
 -> W06 portability audit/plan
 -> W07 Vega pipeline
 -> W08 ADBT/Vega adapter
 -> W09 behavioral verification
 -> W10 Bee provider
 -> W11 lessons
 -> W12 artifacts
 -> W13 instructor operations
 -> W14 rehearsal/release
```

W11 may begin alongside implementation after each command contract stabilizes. Do not record final fixtures before W07-W10 are complete. Do not pin or publish setup instructions before W14 verifies them.

## Whole-workshop definition of done

1. Steps 1-4 teach the progression from one agent call to a phased, verified, replayable harness.
2. An attendee may bring a suitable React Native app or use Pocket Cinema without receiving a second-class experience.
3. The original app remains unchanged; live work occurs in a guarded generated workspace.
4. The portability audit and plan/cost gate run before any source edit.
5. The only live platform path is Vega with ADBT and Kepler/VDA.
6. The TV lab verifies remote and focus behavior, not only compilation.
7. Project memory is explicit, approved, versioned, and distinct from checkpoint state.
8. Bee contributes selected context with provenance and is never required for replay or reproducibility.
9. Every live dependency has a committed fallback and a rehearsed recovery path.
10. Docs, commands, fixtures, reports, screenshots, instructor materials, and release artifacts are complete and tested from a fresh clone.
11. `packages/harness` remains unchanged except for an optional documentation link; the workshop explains the relationship without importing production internals.
