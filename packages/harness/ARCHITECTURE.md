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

Calls the Anthropic Messages API directly with a manual tool-use loop. The harness defines typed tools (clone_template, apply_theme, etc.) and handles tool calls/results itself. More control, requires `ANTHROPIC_API_KEY`.

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

### Phase 2: Clone Template

- Action: `git clone` the react-native-multi-tv-app-sample monorepo, strip git history, `yarn install`
- Output: A working monorepo in `out/<runId>/app/`

### Phase 3: Metadata & Branding

- Skills loaded: `template-anatomy.md`, `theming.md`, `firetv-leanback.md`
- Action: Patch app.json with name/slug/bundleId, replace theme tokens with brand colors, update font references
- Output: The template now looks like "your app" instead of the sample

### Phase 4: Manifest Wiring

- Skills loaded: `template-anatomy.md`, `manifest-wiring.md`
- Action: Write `content.json` to the data directory, create React hooks (`useVideos`, `useFeatured`, `useCategories`, etc.)
- Output: The template's screens can now render your content

### Phase 5: Simulator Build

- Skills loaded: `expo-tv-config.md`
- Action: Run `EXPO_TV=1 expo prebuild` for each target platform, attempt web export
- Output: Native project files (android/, ios/) ready for compilation

### Phase 6: Visual & Smoke Test

- Skills loaded: `10ft-ui.md`, `video-player.md`
- Action: Verify build artifacts exist, capture screenshots if simulators are running, write build report
- Output: `build-report.txt`, screenshots in `out/<runId>/screenshots/`

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

## Architecture (claude-run mode)

```
┌─────────────────────────────────────────────────────┐
│  CLI (index.ts)                                     │
│  Parses args, loads inputs, picks orchestrator      │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│  ClaudeOrchestrator (claude-orchestrator.ts)         │
│                                                     │
│  • Iterates V1_PHASES                               │
│  • Builds prompt per phase: skills + instructions   │
│  • Spawns `claude -p "..." --allowedTools ...`      │
│  • Logs to RunLog (NDJSON audit trail)              │
│  • Token budget tracking                            │
│  • Graceful degradation on phase failure            │
└────────────────────────┬────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌───────────┐ ┌────────────┐
   │ SkillLibrary│ │  RunLog   │ │  Planner   │
   │ loads .md   │ │ NDJSON    │ │ AppSpec    │
   │ per phase   │ │ audit log │ │ generation │
   └────────────┘ └───────────┘ └────────────┘
```

## Key Files

```
packages/harness/
├── src/
│   ├── index.ts                 CLI entry point (run, claude-run, doctor, replay)
│   ├── claude-orchestrator.ts   Spawns claude CLI per phase (recommended mode)
│   ├── orchestrator.ts          API mode — manual Messages API + tool loop
│   ├── tool-registry.ts         Typed tool registration (API mode only)
│   ├── skill-library.ts         Loads skills from ./skills/ per phase
│   ├── run-log.ts               NDJSON audit trail
│   ├── recorder.ts              Run recording/replay for demos
│   ├── doctor.ts                Pre-flight prerequisite checks
│   ├── types.ts                 Zod schemas, phase definitions, type system
│   └── tools/                   Tool handlers (API mode only)
│       ├── clone-template.ts
│       ├── apply-theme.ts
│       ├── inject-content.ts
│       ├── expo-prebuild.ts
│       ├── run-simulator.ts
│       └── ...
├── tests/                       Vitest unit tests
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

## Error Handling

- **Per-phase isolation**: A failed phase doesn't crash the harness. It's marked "failed" and the next phase runs.
- **Token budget**: Tracked across all API calls. At 500K tokens, the run stops gracefully.
- **Retry budget**: API mode retries each phase up to 5 times with error context fed back to the model.
- **Degraded continuation**: If a platform fails to build, others still proceed.
- **Doctor command**: Catches missing prerequisites before you waste time on a doomed run.

## Extending

### Adding a new phase

1. Add the phase name to `PHASES` in `types.ts`
2. Add it to `V1_PHASES` if it should run in v1
3. Add its skill mapping in `skill-library.ts` (`PHASE_SKILL_MAP`)
4. Add its instructions in `claude-orchestrator.ts` (`PHASE_INSTRUCTIONS`)
5. (API mode) Add its tools to `PHASE_TOOLS` in `orchestrator.ts`

### Adding a new skill

1. Create `skills/<name>.md` with frontmatter (`name`, `applies_to`)
2. Reference it in `PHASE_SKILL_MAP` for the relevant phases
3. The SkillLibrary auto-indexes it on startup

### Adding a new platform

1. Add the platform value to `PlatformSchema` in `types.ts`
2. Update the `simulator_build` instructions to handle it
3. Add a skill file if the platform has unique quirks
