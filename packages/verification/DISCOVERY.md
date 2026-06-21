# DISCOVERY.md — TV App Harness Verification System

> Phase 0 output. Human must confirm before Phase 1 begins.

---

## 0.1 Repo & Workspace Shape

| Field | Value |
|-------|-------|
| Root | `/Users/laquigi/Projects/your-harness-repo` |
| Package manager | Yarn Classic (1.22.21) at harness level; generated apps use Yarn 4.5.0 |
| Monorepo task runner | None (no turbo.json, nx.json, or lerna.json) |
| Workspace packages | `packages/harness/` (`@tv-harness/core`), `packages/web-ui/` (Vite dashboard) |
| Harness orchestrator | `packages/harness/src/` |
| Skills directory | `skills/` (15 core skills + `skills/auto/` for agent-generated) |
| Examples directory | `examples/` (cooking-shows, fitness-tv, music-videos, sports-live) |
| Prompt templates | `packages/harness/prompts/` |

---

## 0.2 Harness Entrypoint

**Mode:** CLI only — no exported programmatic API. Package declares `"bin": { "tv-harness": "dist/index.js" }` but `main` points at the CLI (shebang script).

**Primary commands:**
```bash
# Claude CLI mode (recommended for generation):
npx tv-harness claude-run [inputDir] --example <name> --generate-only --resume [runId] --from-phase <name> --config <path> --no-tui

# API mode (uses Anthropic Messages API directly):
npx tv-harness run [inputDir] --example <name> --generate-only
```

**Input contract — files in the input directory:**

| File | Required | Schema |
|------|----------|--------|
| `content.json` | YES | `ContentManifestSchema` — title, description, categories[{id, name, items[]}], videos[{id, title, description, duration_sec, thumbnail_url, stream_url, stream_type, tags[]}], featured[] |
| `brand.json` | No | `BrandKitSchema` — name, primary_color, accent_color, background_color, font_family, logo_path, splash_path |
| `design.json` | No | `DesignTokensSchema` — template, hero_height, show_hero, tile_size, tile_ratio, spacing, corner_radius, rails_per_screen, font_scale, show_descriptions, show_duration, navigation_style, focus_style, animation_speed |
| `run.json` | No | `RunConfigSchema` — platforms[], max_iterations, max_retries_per_phase, build_locally, eas_profile, visual_qa_max_iterations, visual_qa_pass_threshold, use_devtools |
| `screens.json` | No | `ScreenTreeSchema` — navigation_type, home: ScreenNode, screens: ScreenNode[] |
| `prompt.txt` | No | Plain text brief for the planner |
| `harness.config.json` | No | `HarnessConfigSchema` — template{repo, branch?}, models{plan, execution}, tokenBudget, phases[] |

**Output location:** `packages/harness/out/<runId>/`

**Output contents:**
- `app/` — the generated app (git repo, one commit per phase)
- `spec.json` — planner-produced AppSpec
- `checkpoint.json` — resume state
- `report.md` — phase results table with cost, tokens, status
- `run.log` — NDJSON audit trail with timestamps
- `screenshots/` — visual QA captures
- `prompt-<phase>.md` / `response-<phase>.txt` — per-phase artifacts

**AppSpec (planner output, Zod schema `AppSpecSchema`):**
```typescript
{
  app_name: string;
  theme: { mode: "dark" | "light"; tokens: Record<string, string> };
  navigation: { type: "drawer" | "tabs" | "single"; routes: {id, label, icon?}[] };
  screens: { id, route, layout, uses_template_screen?, sections[] }[];
  components_to_customize: { component, changes }[];
  components_to_add: { name, description, props }[];
  data_bindings: { manifest_path?, screen_id?, section_id? }[];
  player: { lib: "react-native-video" };
  auth?: { provider: "none" | "oauth"; flow?: "device_code" };
}
```

---

## 0.3 Tool/Skill/Phase Inventory

### Default Pipeline Phases (V1_PHASES)

| # | Phase | Kind | Skills Loaded | Observable Effect on Generated App |
|---|-------|------|---------------|-----------------------------------|
| 1 | `plan` | plan | — | Produces `spec.json` (AppSpec). No app files yet. |
| 2 | `scaffold` | agent | template-anatomy | Clones template repo → `app/`, runs `yarn install`, git init, applies monorepo resolutions |
| 3 | `branding` | agent | template-anatomy, theming, firetv-leanback | Patches theme/colors.ts, app.json (name/slug/bundleId), font references |
| 4 | `content` | agent | template-anatomy, manifest-wiring | Writes moviesData.ts with content hooks, creates data sources matching content.json |
| 5 | `screens` | agent | template-anatomy, shared-ui-catalog, 10ft-ui | Creates/customizes screen components per AppSpec |
| 6 | `creative_ui` | agent | template-anatomy, shared-ui-catalog, 10ft-ui, creative-tv-ui | Visual polish, custom animations, branded touches |
| 7 | `navigation` | agent | template-anatomy, shared-ui-catalog, spatial-navigation | Updates drawer/tabs navigator to match AppSpec routes |
| 8 | `verify` | agent | — | Runs `tsc --noEmit`, fixes type errors, verifies RemoteControlManager return type, checks focus |
| 9 | `build_loop` | agent (build) | — | `EXPO_TV=1 expo start --web` verification, Android/iOS prebuild |
| 10 | `vega_build_loop` | agent (build) | vega-sdk | `npx kepler build` in apps/vega/ (only if firetv-vega in platforms) |
| 11 | `visual_qa_loop` | visual_qa | 10ft-ui, theming, spatial-navigation | Serves web, screenshots, grades 10-foot UI, fixes defects (up to N iterations) |
| 12 | `android_test_loop` | agent (build) | android-tv-testing | Installs APK on emulator, runs D-pad navigation tests |

### Phase Dependencies (DAG)

```
plan → scaffold → branding
                → content
     branding + content → screens → creative_ui → navigation → verify → build_loop → visual_qa_loop
                                                                      → vega_build_loop
                                                            build_loop → android_test_loop
```

### Skills (files in `skills/`)

| Skill File | Loaded By Phase(s) | Purpose |
|------------|-------------------|---------|
| `10ft-ui.md` | screens, creative_ui, visual_qa_loop | TV UI best practices (font sizes, safe zones, focus) |
| `android-tv-testing.md` | android_test_loop | D-pad testing methodology |
| `creative-tv-ui.md` | creative_ui | Visual polish patterns |
| `eas-build.md` | (eas_build) | Cloud build config |
| `expo-tv-config.md` | (various) | Expo TV configuration |
| `firetv-leanback.md` | branding | Fire TV leanback manifest setup |
| `manifest-wiring.md` | content | How to wire content manifests |
| `shared-ui-catalog.md` | screens, creative_ui, navigation | Available template components |
| `spatial-navigation.md` | navigation, visual_qa_loop | react-tv-space-navigation patterns |
| `template-anatomy.md` | scaffold, branding, content, screens, creative_ui, navigation | File structure of the template |
| `theming.md` | branding, visual_qa_loop | Theme token system |
| `vega-sdk.md` | vega_build_loop | Vega/Kepler build system |
| `video-player.md` | (screens) | Video player integration |

### Existing Verification Checks (in `verification.ts`)

The harness already has inline structural checks during the `build_loop` phase:
- `file_exists` — check a file path exists in generated app
- `git_dirty` — check uncommitted changes exist after a phase
- `grep` — search for a string in a file
- `tsc` — TypeScript compilation check
- `focus_check` — static lint for TV focus/accessibility

---

## 0.4 Platform Targets

| Platform | Enum Value | Build Command | Build Artifact |
|----------|-----------|---------------|----------------|
| Android TV | `androidtv` | `EXPO_TV=1 npx expo prebuild --platform android --no-install` | `app/apps/expo-multi-tv/android/` |
| Apple TV | `appletv` | `EXPO_TV=1 npx expo prebuild --platform ios --no-install` | `app/apps/expo-multi-tv/ios/` |
| Fire TV (FOS) | `firetv-fos` | Same as androidtv (manifest differences via leanback skill) | Same as androidtv |
| Fire TV (Vega) | `firetv-vega` | `npx kepler build` in `app/apps/vega/` | Vega app bundle |
| Web | `web` | `EXPO_TV=1 npx expo start --web` (verified by curl/screenshot) | Web bundle (Metro/Webpack) |

**Cheapest platforms for testing:** `web` (no native build), then `androidtv` (prebuild only, no APK compile needed for structural checks).

---

## 0.5 Template Base & SDK

**Template repo:** `https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git`
**Template branch:** Configurable via `harness.config.json` → `template.branch` (defaults to repo default branch)

**SDK versions (from template/generated app):**
- React: 19.1.0
- React Native: `react-native-tvos ~0.81.0-0`
- react-tv-space-navigation: `6.0.0-beta1`
- Expo: ~54.x
- Yarn: 4.5.0 (berry, with workspaces)

**Generated app anatomy:**
```
app/
├── apps/
│   ├── expo-multi-tv/          # Universal entry: Android TV, Apple TV, Web
│   │   ├── App.tsx             # Root component
│   │   ├── app.json            # Expo config (name, plugins, icons)
│   │   ├── metro.config.js     # Metro bundler config (blockList)
│   │   ├── android/            # Generated by expo prebuild
│   │   └── ios/                # Generated by expo prebuild
│   └── vega/                   # Fire TV Vega OS entry
│       └── src/App.tsx
├── packages/
│   └── shared-ui/
│       └── src/
│           ├── screens/        # HomeScreen.tsx, DetailsScreen.tsx, SettingsScreen.tsx, etc.
│           ├── navigation/     # AppNavigator.tsx, RootNavigator.tsx, DrawerNavigator.tsx, types.ts
│           ├── components/     # FocusablePressable.tsx, CustomDrawerContent.tsx, MenuContext.tsx, player/
│           ├── hooks/          # useScale.ts
│           ├── theme/          # colors.ts, typography.ts (token definitions)
│           ├── data/           # moviesData.ts (content hooks)
│           ├── app/            # configureRemoteControl.ts
│           │   └── remote-control/  # RemoteControlManager.ts, .android.ts, .ios.ts, .kepler.ts
│           ├── utils/          # rtl.ts
│           └── index.ts        # Barrel export
├── package.json                # Root workspace config
└── tsconfig.base.json
```

**Where screens live:** `app/packages/shared-ui/src/screens/<Name>Screen.tsx`

**Nav/router graph:** `app/packages/shared-ui/src/navigation/`
- `RootNavigator.tsx` — NativeStack (DrawerNavigator + Detail + Player)
- `DrawerNavigator.tsx` — Drawer screens (Home, Explore/Categories, TV/Search, Settings)
- `AppNavigator.tsx` — NavigationContainer wrapper + GoBackConfiguration

**Theme tokens:** `app/packages/shared-ui/src/theme/colors.ts` + `typography.ts`
- `colors.ts`: exports `colors` object with `background`, `text`, `textSecondary`, `primary`, `secondary`, `border`, `card`, `cardElevated`, `textOnPrimary`
- `typography.ts`: exports `typography` object with `fontFamily` (display, body, bodyMedium), `fontSize` scales

**Focus/D-pad system:**
- `react-tv-space-navigation` library with `SpatialNavigationRoot`, `SpatialNavigationNode`, `SpatialNavigationFocusableView`
- Each screen wraps content in `<SpatialNavigationRoot isActive={isFocused && !isMenuOpen}>`
- Remote control via `RemoteControlManager` (platform-specific files) + `configureRemoteControl.ts`
- `addKeydownListener` MUST return the listener itself (not a cleanup function) — critical invariant

---

## 0.6 Determinism Surface

| Parameter | Location | Default | How to Pin |
|-----------|----------|---------|-----------|
| Model (plan phase) | `harness.config.json` → `models.plan` | `claude-opus-4-6` | Set in config |
| Model (execution phases) | `harness.config.json` → `models.execution` | `claude-sonnet-4-6` | Set in config; per-phase override via PhaseSpec.model |
| Temperature | NOT exposed | Claude default (1.0) | **Cannot pin** — no mechanism in CLI spawn or API call |
| Seed | NOT exposed | None | **Cannot pin** — absent from source |
| Token budget | `harness.config.json` → `tokenBudget` | 500,000 | Set in config |
| Max retries | `run.json` → `max_retries_per_phase` | 5 | Set in run.json |
| Template commit | `harness.config.json` → `template.branch` | Repo default branch | Pin a specific tag/commit |
| Prompt templates | `prompts/*.md` | Git-tracked | Stable unless modified |
| Skills on disk | `skills/` + `skills/auto/` | Git-tracked (core); auto-skills accumulate | Pin by excluding auto-skills or pruning before run |
| Claude CLI version | Host system | Whatever is installed | Pin via npm/package lock |
| Node.js version | Host system | 20+ required | Pin in CI |

**Non-determinism sources (unpinable):**
1. No temperature/seed parameter support — primary source of variance
2. Auto-skills from previous runs leak context into future runs
3. Template repo default branch may advance

---

## 0.7 Cost/Latency Hooks

**Cost is tracked.** Both modes (claude-run and API) parse cost from result events.

| Mode | Source | Storage |
|------|--------|---------|
| claude-run | Claude CLI `stream-json` → `result.total_cost_usd` | `this.phaseCosts: Map<string, number>`, `this.totalCost` |
| API | Agent SDK result → `message.total_cost_usd` | Same |

**How to read cost:**
1. `report.md` — table with per-phase cost column + total
2. TUI — live display per-phase
3. `run.log` — NDJSON (timestamps for latency derivation)

**Latency:** Not explicitly measured as a duration field. Derivable from `run.log` NDJSON entry timestamps (each has ISO timestamp). The report does not include wall-clock time per phase.

**Token tracking:** `state.tokensUsed` accumulated from `usage.input_tokens + usage.output_tokens`. Compared against `state.tokenBudget` (default 500k). Budget exhaustion triggers graceful pipeline stop.

---

## Stale Assumptions (PRD vs Reality)

| PRD Assumption | Reality |
|----------------|---------|
| Tools: `clone_template`, `apply_theme`, `replace_assets`, `inject_content`, `add_screen`, `remove_screen`, `vega_build` | Tools exist as MCP handlers in API mode, but **claude-run mode** (the primary mode) uses standard Claude Code tools (Bash, Read, Write, Edit) with skills loaded as prompt context. The "tools" are phases, not discrete callable functions. |
| Programmatic API exists | **CLI only** — no exported function. Task 1 must wrap the CLI or add a minimal exported entrypoint. |
| Platforms: `firetv-fos` is distinct build | `firetv-fos` uses the same build as `androidtv` — only manifest differences applied by the leanback skill |
| Temperature/seed can be pinned | **Cannot be pinned** — no mechanism exists in the harness. This is the #1 non-determinism source. |
| Latency explicitly tracked | Only derivable from timestamps in run.log, not a first-class metric |
| `shared-types` package exists | Does not exist — must be created |
| `packages/verification/` exists | Does not exist — must be created |
| Detox configured | Not present — must be added for Level 3 |

---

## Key Paths Summary

| Purpose | Path |
|---------|------|
| CLI entrypoint | `packages/harness/src/index.ts` |
| Types/schemas | `packages/harness/src/types.ts` |
| Pipeline engine | `packages/harness/src/pipeline-engine.ts` |
| Claude-run orchestrator | `packages/harness/src/claude-orchestrator.ts` |
| API-mode orchestrator | `packages/harness/src/orchestrator.ts` |
| Phase prompt builder | `packages/harness/src/phase-prompts.ts` |
| Visual QA loop | `packages/harness/src/visual-qa.ts` |
| Inline verification | `packages/harness/src/verification.ts` |
| Skill loader | `packages/harness/src/skill-library.ts` |
| Run report writer | `packages/harness/src/run-report.ts` |
| Harness config loader | `packages/harness/src/harness-config.ts` |
| Default phase config | `packages/harness/src/harness-config.ts` (DEFAULT_PHASES) |
