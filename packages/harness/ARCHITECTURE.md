# TV App Harness — How It Works

A coding agent harness that takes a prompt + content manifest and produces a buildable, multi-platform TV application by orchestrating Claude through a phased pipeline.

## Core Idea

Instead of asking an LLM to generate an entire TV app from scratch (unreliable), the harness:

1. Starts from a **proven template** (AmazonAppDev/react-native-multi-tv-app-sample)
2. Feeds Claude **domain-specific skills** (markdown knowledge files) per phase
3. Drives Claude through **sequential phases**, each with a focused task
4. Validates output at each step before proceeding

This gives an 80/20 split: 80% deterministic (the template already works) and 20% LLM-driven (branding, content wiring, planning decisions).

## Two Modes

### `claude-run` (recommended)

Spawns the `claude` CLI as a subprocess for each phase. Claude handles file editing, bash commands, and the agentic loop natively. The harness just orchestrates phases and injects skills as context.

```
Harness → spawns claude -p "phase instructions + skills" → Claude edits files → Harness checks result → next phase
```

### `run` (API mode)

Calls the Anthropic Messages API directly with a manual tool-use loop. The harness defines typed tools (`clone_template`, `apply_theme`, `inject_content`, etc.) and handles tool calls/results itself. More control, requires `ANTHROPIC_API_KEY`.

## The Pipeline

```
INPUT                    GENERATION                         VERIFICATION
─────                    ──────────                         ────────────
prompt.txt ──┐
content.json ├──► [Plan] ──► [Clone] ──► [Brand] ──► [Content] ──► [Build] ──► [Verify]
brand.json  ─┘
run.json ─────────────────────────────────────────────────────────────────────────────────►
```

### Phase 1: Plan

- Input: prompt + content manifest + brand kit
- Action: Claude produces an **AppSpec** — a structured JSON describing the app's screens, navigation, theme tokens, and data bindings
- Validation: Zod schema parse (AppSpecSchema)
- Model: claude-opus-4-7 (planning needs the strongest model)

### Phase 2: Scaffold

- Action: `git clone` the react-native-multi-tv-app-sample monorepo, strip git history, `yarn install`
- Output: A working monorepo in `out/<runId>/app/`

### Phase 3: Branding

- Skills loaded: `template-anatomy.md`, `theming.md`, `firetv-leanback.md`
- Action: Patch app.json with name/slug/bundleId, replace theme tokens with brand colors, update font references
- Output: The template now looks like "your app" instead of the sample

### Phase 4: Content Wiring

- Skills loaded: `template-anatomy.md`, `manifest-wiring.md`
- Action: Write `content.json` to the data directory, create React hooks (`useVideos`, `useFeatured`, `useCategories`, etc.)
- Output: The template's screens can now render your content

### Phase 5: Screens & Navigation

- Skills loaded: `template-anatomy.md`, `shared-ui-catalog.md`, `spatial-navigation.md`, `10ft-ui.md`
- Action: Customize existing screens, create only missing screens, and update drawer/tab/hidden navigation
- Output: The AppSpec's screen tree is represented in the app

### Phase 6: Verify

- Action: Run static checks, TypeScript, and TV-specific focus/layout checks
- Output: Compile-safe generated source with obvious focus regressions repaired

### Phase 7: Build Loop

- Skills loaded: `expo-tv-config.md`
- Action: Run `EXPO_TV=1 expo prebuild` for each target platform, attempt web export
- Output: Native project files (android/, ios/) ready for compilation

### Phase 8: Visual QA Loop

- Skills loaded: `10ft-ui.md`, `theming.md`, `spatial-navigation.md`
- Action: Start the web app, capture screenshots, classify visual defects, and ask Claude to fix critical issues
- Output: `visual-qa-report.md`, screenshots, and `screenshots.html` when images are present

## Skill Library

Skills are plain markdown files in `./skills/` that get injected into Claude's context per phase. They contain domain knowledge that the model wouldn't reliably know otherwise.

```
skills/
├── meta.md                 ← loaded EVERY phase (tells Claude the library exists)
├── template-anatomy.md     ← monorepo layout, where files belong
├── theming.md              ← brand.json → token mapping rules
├── manifest-wiring.md      ← content.json → hooks → screens
├── spatial-navigation.md   ← React TV Space Navigation patterns
├── expo-tv-config.md       ← EXPO_TV=1, plugin options, prebuild
├── firetv-leanback.md      ← Fire TV manifest, banner specs
├── vega-sdk.md             ← Vega OS / Kepler packages
├── 10ft-ui.md              ← type scale, contrast, safe areas
├── video-player.md         ← react-native-video config
├── shared-ui-catalog.md    ← what components exist in the template
└── eas-build.md            ← EAS Build profiles
```

Each phase loads only the skills it needs (lazy loading). This keeps the context focused rather than dumping everything in at once.

### How skills help

Without skills, Claude might:
- Put files in the wrong monorepo location
- Use wrong color format for the theme system
- Miss platform-specific config (EXPO_TV=1, androidTVBanner dimensions)
- Generate new components when the template already has them

With skills loaded, Claude knows the exact file structure, naming conventions, and platform quirks.

## Architecture

```
+-------------------------------------------------------------+
|  CLI (index.ts)                                             |
|  Parses args, validates inputs (friendly Zod errors),       |
|  loads harness.config.json, picks an orchestrator           |
+------------------------------+------------------------------+
                               |
+------------------------------v------------------------------+
|  PipelineEngine (pipeline-engine.ts) — shared, unit-tested  |
|                                                             |
|  - Iterates the configured PhaseSpec list                   |
|  - Dependency blocking, retry-with-context, plan abort      |
|  - Resume from checkpoint (skips completed phases)          |
|  - Token-budget stop, success hooks (commit + checkpoint)   |
+------------+-------------------------------+----------------+
             | executor                      | executor
+------------v-------------+    +------------v----------------+
| ClaudeOrchestrator       |    | TVAppHarness (API mode)     |
| spawns `claude -p`       |    | Messages API + typed        |
| per phase                |    | tool loop (MCP server)      |
+------------+-------------+    +------------+----------------+
             |                               |
     +-------+----------+-----------+-------+
     v                  v           v
+-----------+    +-----------+    +---------------+    +----------------+
| Skill     |    | RunLog    |    | Verification  |    | HarnessConfig  |
| Library   |    | NDJSON    |    | declarative   |    | template +     |
| per phase |    | audit log |    | checks        |    | phases + models|
+-----------+    +-----------+    +---------------+    +----------------+
```

The split that matters: the **engine is deterministic and unit-tested** (ordering, retries, blocking, resume — no model required), while **executors are stochastic** (a Claude subprocess or an API tool loop doing the actual work). Phases, skills, verification checks, the template repo, and model routing are all **data** in `harness-config.ts`, overridable per project via `harness.config.json`.

## Key Files

```
packages/harness/
├── src/
│   ├── index.ts                 CLI entry point (run, claude-run, doctor, replay, ...)
│   ├── pipeline-engine.ts       Shared deterministic phase loop (deps, retry, resume policy)
│   ├── harness-config.ts        PhaseSpec schema, default pipeline, harness.config.json loader
│   ├── verification.ts          Declarative verify checks (file_exists/grep/tsc/...)
│   ├── checkpoint.ts            checkpoint.json save/load + --resume discovery
│   ├── claude-cli.ts            Claude CLI invocation: binary discovery, stream-json parsing
│   ├── claude-orchestrator.ts   claude-run executor — lifecycle + engine wiring
│   ├── orchestrator.ts          API-mode executor — Messages API + tool loop
│   ├── phase-prompts.ts         Per-phase prompt assembly (variables, plan prompt, design ctx)
│   ├── visual-qa.ts             Visual QA loop: web server, bundle prewarm, capture/analyze/fix
│   ├── run-report.ts            Shared end-of-run report.md writer
│   ├── tool-registry.ts         Typed tool registration (API mode only)
│   ├── skill-library.ts         Loads skills from ./skills/ per phase
│   ├── prompt-loader.ts         Loads prompts/*.md (project dir overrides built-ins)
│   ├── run-log.ts               NDJSON audit trail
│   ├── recorder.ts              Run recording/replay for demos
│   ├── doctor.ts                Pre-flight prerequisite checks (--fix shows commands)
│   ├── types.ts                 Zod schemas, phase definitions, type system
│   └── tools/                   Tool handlers (API mode only)
│       ├── clone-template.ts
│       ├── apply-theme.ts
│       ├── inject-content.ts
│       ├── expo-prebuild.ts
│       ├── run-simulator.ts
│       └── ...
├── prompts/                     Phase prompt templates (navigation_* variants overridable)
├── tests/                       Vitest unit tests (engine, config, verification, ...)
└── vitest.config.ts
```

## Inputs

The harness reads from a directory containing:

| File | Required | Purpose |
|------|----------|---------|
| `content.json` | Yes | Videos, categories, featured items |
| `brand.json` | No | Colors, font, logo paths |
| `run.json` | No | Target platforms, iteration budget |
| `prompt.txt` | No | Natural language brief for the planner |

See `examples/cooking-shows/` for a complete input set.

## Outputs

Each run produces `out/<runId>/`:

```
out/<runId>/
├── app/              Generated app source (the customized template)
├── screenshots/      Platform screenshots (if simulators ran)
├── spec.json         The AppSpec from the planner
├── build-report.txt  Summary of which platforms built
└── run.log           NDJSON audit trail of every phase
```

## Error Handling & Recovery

- **Per-phase isolation**: A failed phase doesn't crash the harness. It's marked "failed"; only phases that depend on it get blocked.
- **Token budget**: Tracked across all calls (configurable via `tokenBudget`). When exhausted, the run stops gracefully between phases.
- **Retry budget**: Failed/degraded phases retry up to `max_retries_per_phase` (or a per-phase `retries` override) with error context fed back.
- **Plan abort**: Phases marked `abortOnFailure` (plan, by default) stop the whole run — nothing downstream can work without an AppSpec.
- **Checkpoint & resume**: `checkpoint.json` is written after every successful phase. `claude-run --resume [runId]` skips completed phases; `--from-phase <name>` re-runs from a specific point.
- **Doctor command**: Catches missing prerequisites before you waste time on a doomed run; `doctor --fix` prints the exact fix command for each failure.

## Extending

Most extension is **config + markdown only** — no source changes.

### Adding a new phase

Add it to `harness.config.json` in your input dir (or pass `--config`):

```json
{
  "phases": [
    {
      "name": "analytics",
      "prompt": "analytics",
      "insertAfter": "content",
      "skills": ["template-anatomy"],
      "verify": [{ "type": "grep", "pattern": "trackScreenView", "path": "packages/shared-ui/" }]
    }
  ]
}
```

Then write `prompts/analytics.md` in your project (project `prompts/` overrides the built-ins). Override any built-in phase the same way — matching `name` merges your fields onto the default.

### Adding a new skill

1. Create `skills/<name>.md` with frontmatter (`name`, `applies_to`)
2. Reference it from a phase's `skills` list in `harness.config.json`
3. The SkillLibrary auto-indexes it on startup

### Swapping the template

```json
{ "template": { "repo": "https://github.com/you/your-tv-template.git", "branch": "main" } }
```

Write a `template-anatomy.md` skill describing your template's layout so the agent knows where files belong.

### Adding a new platform

1. Add the platform value to `PlatformSchema` in `types.ts`
2. Gate any platform-specific phase with `"requiresPlatform": "<platform>"` in config
3. Add a skill file if the platform has unique quirks
