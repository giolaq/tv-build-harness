# TV App Harness — Implemented Features

## Commands

### `claude-run [dir]` (recommended)
Runs the full pipeline using the Claude CLI as a subprocess per phase. Each phase gets its own Claude session with focused skills and instructions.

```bash
npx tsx src/index.ts claude-run --example cooking-shows
npx tsx src/index.ts claude-run ./my-inputs
npx tsx src/index.ts claude-run --example music-videos --generate-only
npx tsx src/index.ts claude-run --resume                      # pick up the latest checkpointed run
npx tsx src/index.ts claude-run --resume d811afcb --from-phase navigation
```

Options:
- `--example <name>` — use a bundled example (cooking-shows, music-videos, fitness-tv, sports-live)
- `--generate-only` — skip build/simulator phases, only generate code
- `--resume [runId]` — resume from a previous run's checkpoint (latest run if no runId)
- `--from-phase <name>` — treat phases before `<name>` as completed
- `--config <path>` — use a harness.config.json (custom template/phases/skills/models)
- `--no-tui` — plain console output

### Customizing the pipeline: `harness.config.json`

Place it in your input directory (or pass `--config`). Override the template repo, models, token budget, and any field of any phase by name — or add entirely new phases with their own prompt files and verify checks. See the root README for the full reference.

### `run [dir]`
Runs the full pipeline using the Anthropic Messages API directly. Requires `ANTHROPIC_API_KEY`. Uses Opus for planning, Sonnet for execution. Records all API turns for replay.

```bash
npx tsx src/index.ts run --example cooking-shows
```

### `add-screen <Name> --type=<layout>`
Adds a new screen to a previously generated app. Spawns Claude with TV-specific skills loaded to create a proper focusable screen with navigation wiring.

```bash
npx tsx src/index.ts add-screen Watchlist --type=grid
npx tsx src/index.ts add-screen Home --type=hero+rails --app=./out/abc123/app
```

Valid types: `hero+rails`, `grid`, `detail`, `player`, `settings`, `search`

### `review [scope]`
Reviews a generated app for TV-specific issues (focus navigation, 10ft UI compliance, platform detection, accessibility). Can fix simple issues directly.

```bash
npx tsx src/index.ts review
npx tsx src/index.ts review "focus navigation"
npx tsx src/index.ts review --app=./out/abc123/app
```

### `doctor`
Pre-flight check for all prerequisites: Node, Yarn, Git, Claude CLI, API key, Expo, Xcode, Android SDK, tvOS simulators, Android TV AVDs, disk space. Mode-aware: the API key is optional when the Claude CLI is installed. `--fix` prints the exact command that fixes each failing check.

```bash
npx tsx src/index.ts doctor
npx tsx src/index.ts doctor --fix
```

### `replay <file>`
Replays a recorded API-mode run from a `recording.json` file. Shows turn-by-turn token usage.

```bash
npx tsx src/index.ts replay out/abc123/recording.json
```

### `install-skills` / `update-skills`
Fetches or updates remote skills from the registry (currently react-native-tvos/skills on GitHub).

```bash
npx tsx src/index.ts install-skills
npx tsx src/index.ts update-skills
```

---

## Pipeline Phases (V1)

The pipeline runs these 10 phases in order. Each phase has its own retry budget, skill set, and verification step.

| # | Phase | What it does | Skills loaded |
|---|-------|-------------|--------------|
| 1 | `plan` | Produces an AppSpec JSON from prompt + manifest + brand | (none) |
| 2 | `scaffold` | Clones the AmazonAppDev template, strips git, installs deps, normalizes workspace deps | template-anatomy |
| 3 | `branding` | Applies app name, colors, fonts to existing theme files | template-anatomy, theming, firetv-leanback |
| 4 | `content` | Injects content.json, creates/updates data hooks, wires screens | template-anatomy, manifest-wiring |
| 5 | `screens` | Adds/modifies screens per AppSpec (reuse-first) | template-anatomy, shared-ui-catalog, 10ft-ui |
| 6 | `navigation` | Updates drawer/tab/hidden route table to match AppSpec routes | template-anatomy, shared-ui-catalog, spatial-navigation |
| 7 | `verify` | Runs static checks, fixes TypeScript and TV-focus regressions | (prompt-driven static checks) |
| 8 | `build_loop` | Verifies web build, then runs native prebuilds for requested platforms | (prompt-driven build checks) |
| 9 | `vega_build_loop` | Builds the Vega OS app, only when firetv-vega is targeted | vega-sdk |
| 10 | `visual_qa_loop` | Captures browser screenshots, analyzes 10-foot UI defects, and applies fixes | 10ft-ui, theming, spatial-navigation |

---

## Phase Execution Details

### Retry logic (Task 1)
Both modes retry failed/degraded phases up to `max_retries_per_phase` (default 5).

- **claude-run mode:** `executePhaseWithRetry()` loops, logging each attempt with status.
- **API mode:** The inner tool-use loop retries with error context fed back to the model.

If verification fails (e.g. brand color not found in files), the phase is marked `degraded` and retried. If all retries exhausted, the run continues with the phase marked failed (except `plan`, which aborts the entire run).

### Phase verification
After each phase completes, automated checks run:

| Phase | Verification |
|-------|-------------|
| `scaffold` | `package.json` exists in app dir |
| `branding` | git diff shows changes AND brand primary color grep-matches in shared-ui |
| `content` | data/ directory exists AND content title found in shared-ui files |
| `verify` | `npx tsc --noEmit` exits cleanly |

### Auto-commit after phases (Task 8)
After each successful phase in claude-run mode, the harness runs `git add -A && git commit -m "harness: complete phase <name>"` in the app directory. This gives a clean audit trail:

```
$ cd out/<runId>/app && git log --oneline
abc1234 harness: complete phase verify
def5678 harness: complete phase navigation
9012345 harness: complete phase screens
...
1234abc initial template
```

### Plan phase abort
If the plan phase fails (no valid AppSpec produced), the entire run stops immediately. Downstream phases cannot execute without a spec.

---

## Tools (18 total)

### Project tools
| Tool | Purpose |
|------|---------|
| `clone_template` | Git clone + strip history + yarn install |
| `customize_app_metadata` | Patch app.json (name, slug, bundleId) |
| `apply_theme` | Replace color tokens in theme files |
| `replace_assets` | Drop logo/splash/banner into asset dirs |
| `inject_content` | Write content.json + generate data hooks |
| `add_screen` | Generate a new screen from layout template |
| `remove_screen` | Delete screen + clean exports and navigation refs |
| `install_dep` | `yarn workspace <name> add <pkg>` (monorepo-aware) |

### Build & verify tools
| Tool | Purpose |
|------|---------|
| `expo_prebuild` | `EXPO_TV=1 expo prebuild` per platform |
| `run_simulator` | Launch Android TV emulator or Apple TV simulator |
| `capture_screenshot` | Screencap from running simulator |
| `run_smoke_test` | Maestro D-pad flow (placeholder) |
| `vega_build` | Build via Vega SDK toolchain |
| `run_focus_check` | Static lint for TV focus/accessibility issues |
| `git_commit` | Snapshot app state with a commit message |

### Skill-management tools
| Tool | Purpose |
|------|---------|
| `request_skill_load` | Pull a skill on-demand (agent self-serves) |
| `list_skills` | Show available skills (core/auto/all) |
| `write_auto_skill` | Create a new auto-skill (with quality gate: ≥500 chars, Gotchas section, code example) |

---

## Focus Check Tool (Task 11)

Static analysis that scans all `.tsx` files in screens/ and components/ for TV-specific focus issues:

| Check | Severity | What it catches |
|-------|----------|-----------------|
| TouchableOpacity/Highlight usage | warning | Should use Pressable for TV focus |
| onPress on a View | error | Views aren't focusable via D-pad |
| ScrollView without focusable children | warning | D-pad can't scroll unreachable content |
| FlatList without keyExtractor | warning | Focus restoration breaks after scroll |
| TextInput without returnKeyType | warning | TV remote behavior unclear |
| Pressable without `focused` styling | error | Invisible to D-pad users |
| Image with onPress | error | Images aren't focusable |

Run standalone:
```bash
npx tsx -e "
import { focusCheckHandler } from './src/tools/focus-check.ts';
const r = await focusCheckHandler({ workdir: './out/<runId>/app' });
console.log(r.output);
"
```

---

## Screenshot HTML Report (Task 12)

After a run, if screenshots exist in `out/<runId>/screenshots/`, a self-contained HTML file is generated at `out/<runId>/screenshots.html`.

- Base64-embeds all images (no external deps, opens anywhere)
- Groups screenshots by screen name (parsed from filename: `<platform>-<screen>.png`)
- Labels each with platform badge
- Dark theme matching the TV app aesthetic

Generated automatically at end of run. Or manually:
```bash
npx tsx -e "
import { generateScreenshotReport } from './src/screenshot-report.ts';
generateScreenshotReport('./out/<runId>', 'My App');
"
open out/<runId>/screenshots.html
```

---

## Token Cost Reporting (Task 13)

### API mode
Tracks actual input + output tokens across all API calls. Written to `report.md`:

```markdown
## Token Usage

| Metric | Value |
|--------|-------|
| Total tokens | 145,230 |
| Budget | 500,000 |
| Utilization | 29% |
| Estimated cost | $0.9567 |
```

Cost estimate assumes ~70% input / 30% output ratio, mostly Sonnet pricing ($3/M input, $15/M output).

### Claude-run mode
Token tracking happens inside each Claude subprocess (not visible to the harness). The report still shows phase results and artifacts.

---

## Report Generation (Task 4)

Both modes write `out/<runId>/report.md` at the end of every run containing:

- Run metadata (ID, date, app name, platforms, mode)
- Token usage table (API mode)
- Phase results table (status + iterations per phase, errors inline)
- AppSpec summary (navigation type, screen list, theme mode, brand)
- Artifacts list

---

## Recorder / Replay (Task 5)

### Recording (API mode only)
Every Messages API call is recorded to `out/<runId>/recording.json` with:
- Timestamp
- Phase
- Full request (model, system prompt, messages, tools)
- Full response
- Token usage

### Replay
```bash
npx tsx src/index.ts replay out/<runId>/recording.json
```
Plays back turns with timing, shows per-turn token count. Useful for demos and debugging without re-running the pipeline.

---

## Skill Library

### How it works
Skills are markdown files in `./skills/` loaded lazily per phase. `meta.md` loads on every turn to tell the agent the library exists.

### Sources
- **Local skills:** `./skills/*.md` (checked into repo)
- **Remote skills:** Fetched from GitHub on `install-skills`, cached in `./skills/.remote-cache/`
- **Auto-generated skills:** Created by the agent during runs, saved to `./skills/auto/`

### Phase-skill mapping
Each phase loads only the skills it needs. The mapping is defined in `skill-library.ts` (`PHASE_SKILL_MAP`).

### On-demand loading
The agent can call `request_skill_load("spatial-navigation")` mid-phase to pull a skill not in the default set. If the skill doesn't exist, it gets suggestions for similar names.

### Auto-skill creation
The agent can call `write_auto_skill(name, applies_to, content)`. Quality gate enforces:
- ≥ 500 characters
- Must include `## Gotchas` or `## Anti-pattern` section
- Must include at least one code example (``` block)
- Name must be unique

---

## Inputs

Provide these files in a directory (or use `--example`):

| File | Required | Purpose |
|------|----------|---------|
| `content.json` | Yes | Videos, categories, featured items |
| `brand.json` | No | Colors, font, logo paths |
| `run.json` | No | Target platforms, retry budget |
| `prompt.txt` | No | Natural language brief |

### Examples bundled
- `examples/cooking-shows/` — Indie Kitchen (dark, warm accent, 10 videos, 3 categories)
- `examples/music-videos/` — NeonWave (neon purple/cyan, 12 videos, 4 genres)

---

## Outputs

Each run produces `out/<runId>/`:

```
out/<runId>/
├── app/                  # Generated app source (git history per phase)
├── screenshots/          # Platform screenshots (if simulators ran)
├── screenshots.html      # Visual comparison report (if screenshots exist)
├── spec.json             # AppSpec from the planner
├── report.md             # Human-readable run summary
├── run.log               # NDJSON audit trail
└── recording.json        # Full API replay (API mode only)
```

---

## Discovery-First Instructions Pattern

Phase instructions follow a strict pattern to ensure Claude actually modifies files:

1. **Discover** — `find` and `grep` to locate existing files
2. **Read** — Read the files to understand current structure
3. **Edit in-place** — Modify existing files (never create parallel new ones)
4. **Verify** — `grep` for expected values or `tsc --noEmit` to confirm changes took effect

This prevents the common failure mode where Claude creates new files that nothing imports, leaving the app unchanged.
