# PRD: Auto-Generated TV Build

> A coding agent harness that ingests a prompt + content manifest and produces a buildable, runnable TV application (tvOS, Android TV, optionally Tizen / webOS / Fire TV).

---

## 1. Overview

### Problem
Building a TV app from a content catalog today requires bespoke work per project: scaffolding, focus/D-pad navigation, 10-foot UI, platform quirks, video player integration, and CI/build setup. The same patterns repeat across projects.

### Solution
A **harness** — orchestration infrastructure around an LLM — that automates the repeating work. The LLM provides intelligence (interpreting the brief, designing screens, writing component code). The harness provides control (typed tools, deterministic scaffolding, a skill library of TV-specific knowledge, and a build/verify loop).

### Inspiration
- **Hermes Agent** (NousResearch) — file-based skill memory (`SKILL.md`), AIAgent class as single state owner, registry-based tools.
- **Claude Code** — `QueryEngine` pattern: one orchestrator owns all session state; typed tool interface.
- **Expo + react-native-tvos** — the build target; continuous native generation gives a single codebase → multiple TV platforms.

### Base template
The harness does **not** scaffold from blank. It starts from **`AmazonAppDev/react-native-multi-tv-app-sample`** ([github.com/AmazonAppDev/react-native-multi-tv-app-sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample)) — a production-ready monorepo that already covers:

- **Platforms:** Android TV, Apple TV, Fire TV (Fire OS), Fire TV (Vega OS), Web
- **Monorepo:** `apps/expo-multi-tv` (universal) + `apps/vega` (Vega SDK) + `packages/shared-ui` (shared components, screens, hooks, theme)
- **Out-of-the-box features:** drawer navigation, content grid, dynamic hero banner, video player (react-native-video), spatial focus (React TV Space Navigation), remote-control integration, platform-specific files via `.android.ts` / `.ios.ts` / `.kepler.ts` extensions resolved by Metro
- **Stack:** Expo SDK 51, React Navigation, `react-native-tvos`, Yarn workspaces

The harness's job is therefore **customization, not generation**: fork the template, swap branding tokens, wire the user's content manifest into existing screens, add/remove screens per the AppSpec, and run the build. This shifts the determinism ratio to roughly **80/20 templates-vs-LLM-generation**, which is where success rates stay high.

### Non-goals
- Not a no-code visual builder. Output is a real React Native codebase.
- Not a replacement for a CMS. Content is supplied via a manifest.
- Not a multi-tenant SaaS in v1 — single user, local-first.

---

## 2. Goals & Success Criteria

| Goal | Metric |
|------|--------|
| Generate a runnable TV app from one prompt + manifest | First simulator launch success ≥ 80% on retry budget of 5 |
| Cover Apple TV + Android TV in v1 | Both platforms boot from one run |
| Reusable knowledge across runs | ≥ 1 new SKILL.md auto-written per novel task class |
| Iteration speed | End-to-end (prompt → simulator screenshot) < 15 min on M-series Mac |
| Auditable output | Every file change traceable to a tool call in the run log |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────┐
│  INPUTS                                          │
│  • Prompt (natural language brief)               │
│  • Content manifest (JSON: videos, metadata)     │
│  • Brand kit (colors, fonts, logo, splash)       │
│  • Target platforms (tvOS / androidtv / …)       │
└──────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  PLANNER                                         │
│  Structured-output LLM call: prompt → AppSpec    │
└──────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  ORCHESTRATOR (harness core)                     │
│  • Owns session state, budget, iteration cap     │
│  • Tool registry + permission gate               │
│  • Loads relevant SKILL.md into model context    │
│  • Retry/repair loop                             │
└──────────────────────────────────────────────────┘
        │              │               │
        ▼              ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│ TOOLS        │ │ SKILLS      │ │ BUILD/VERIFY │
│ (typed)      │ │ (markdown)  │ │ LOOP         │
└──────────────┘ └─────────────┘ └──────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  OUTPUTS                                         │
│  • Source repo (git-init'd)                      │
│  • .ipa / .apk artifacts (via EAS or local)      │
│  • Build logs + smoke-test report                │
│  • Screenshots per screen                        │
└──────────────────────────────────────────────────┘
```

---

## 4. Inputs

### 4.1 Prompt
Free-form natural language. Example:
> "A streaming app for indie cooking shows. Dark theme, warm accent colors. Home page should have featured row, then categories. Need a watchlist."

### 4.2 Content manifest (`content.json`)
```json
{
  "title": "string",
  "description": "string",
  "categories": [
    { "id": "string", "name": "string", "items": ["video_id"] }
  ],
  "videos": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "duration_sec": 0,
      "thumbnail_url": "string",
      "stream_url": "string",
      "stream_type": "hls|dash|mp4",
      "tags": ["string"]
    }
  ],
  "featured": ["video_id"]
}
```

### 4.3 Brand kit (`brand.json`)
```json
{
  "name": "string",
  "primary_color": "#RRGGBB",
  "accent_color": "#RRGGBB",
  "background_color": "#RRGGBB",
  "font_family": "string",
  "logo_path": "path/to/logo.svg",
  "splash_path": "path/to/splash.png"
}
```

### 4.4 Run config (`run.json`)
```json
{
  "platforms": ["androidtv", "appletv", "firetv-fos", "firetv-vega", "web"],
  "max_iterations": 90,
  "max_retries_per_phase": 5,
  "build_locally": true,
  "eas_profile": "preview"
}
```
Valid platform values mirror the template's targets. `firetv-vega` builds via the `apps/vega` app (Vega SDK); the others build via `apps/expo-multi-tv`.

---

## 5. Planner → AppSpec

The planner is a single structured-output LLM call. Output schema:

```typescript
type AppSpec = {
  app_name: string;
  theme: { mode: "dark" | "light"; tokens: Record<string, string> };
  navigation: {
    type: "drawer" | "tabs" | "single";   // template defaults to drawer
    routes: Route[];
  };
  screens: Screen[];
  components_to_customize: ComponentCustomization[];  // template ships components; we tune them
  components_to_add: ComponentSpec[];                 // only new ones the template doesn't have
  data_bindings: DataBinding[];   // manifest sections → existing template screens
  player: { lib: "react-native-video" };              // template's default; rarely changes
  auth?: { provider: "none" | "oauth"; flow?: "device_code" };
};

type Screen = {
  id: string;
  route: string;
  layout: "hero+rails" | "grid" | "detail" | "player" | "settings" | "search";
  uses_template_screen?: string;   // e.g. "GridScreen", "DetailScreen" — reuse from shared-ui
  sections: Section[];
};

type Section = {
  id: string;
  kind: "featured_hero" | "rail" | "grid" | "text";
  data_source: string;             // ref into manifest
  title?: string;
};
```

The planner's job is **not** to write code. It only produces this spec. The orchestrator then **prefers reusing screens from `packages/shared-ui`** over writing new ones. Free-form generation is reserved for genuinely novel screens and theme/branding work.

---

## 6. Orchestrator

Single class, single owner of session state. Modeled on Hermes' `AIAgent` and Claude Code's `QueryEngine`.

### 6.1 Responsibilities
- Hold the AppSpec, the file tree, the iteration counter, the budget.
- Maintain a tool registry. Every model output goes through the tool gate.
- Load the right SKILL.md files into context per phase (lazy, not all at once). **Always load `meta.md`.**
- Honor `request_skill_load(name)` calls from the agent at any turn — lazy loading isn't only phase-driven; the agent can pull more on demand.
- Honor `write_auto_skill(...)` calls — validate against quality bar, persist to `./skills/auto/`, update in-memory index for the rest of the run.
- Drive the phase machine (see §9).
- Capture every tool call → write to `run.log` (audit trail). Skill loads and auto-skill creations are logged too.
- Recover from tool failures: feed `{tool, error, last_50_lines}` back into the next model turn.

### 6.2 Pseudocode
```python
class TVAppHarness:
    def __init__(self, model, spec, workdir, config):
        self.model = model
        self.spec = spec
        self.workdir = workdir
        self.budget = config.max_iterations
        self.tools = ToolRegistry()                  # see §7
        self.skills = SkillLibrary("./skills")       # see §8
        self.log = RunLog(workdir / "run.log")

    def run(self):
        self.skills.always_load("meta")              # meta is on every turn
        for phase in PHASES:                         # see §9
            self.skills.load_for(phase)
            ok = self.execute_phase(phase)
            if not ok:
                self.attempt_repair(phase)
        return self.collect_artifacts()

    # Called by tool dispatch when the agent invokes request_skill_load
    def on_request_skill_load(self, name):
        return self.skills.load_on_demand(name)      # adds to context next turn

    # Called by tool dispatch when the agent invokes write_auto_skill
    def on_write_auto_skill(self, name, frontmatter, content):
        return self.skills.create_auto_skill(name, frontmatter, content)
```

---

## 7. Tool Layer

Keep small and typed. Every tool returns `{ok: bool, output: any, error?: str}`.

### Project tools
| Tool | Purpose |
|------|---------|
| `clone_template(name)` | `git clone https://github.com/AmazonAppDev/react-native-multi-tv-app-sample` then rename, strip git history, `yarn install` |
| `customize_app_metadata(name, slug, bundleId)` | Patches `app.json`, `package.json`, monorepo root, Vega manifest |
| `apply_theme(brand_kit)` | Replaces theme tokens in `packages/shared-ui/theme/` and per-platform overrides |
| `replace_assets(logo, splash, icon, banner)` | Drops new images into `assets/`; regenerates `androidTVBanner` (400×240) |
| `inject_content(manifest)` | Writes manifest to `packages/shared-ui/data/` and wires data hooks to existing screens |
| `read_file(path)` | Read a project file |
| `write_file(path, content)` | Create new file |
| `patch_file(path, search, replace)` | Targeted edit, must be unique |
| `add_screen(spec)` | Generates a new screen by composing existing `shared-ui` components |
| `remove_screen(id)` | Removes a screen from `shared-ui` + drawer routes |
| `install_dep(pkg, workspace, dev?)` | yarn workspace add (monorepo-aware) |

### Build & verify tools
| Tool | Purpose |
|------|---------|
| `expo_prebuild(platform)` | `EXPO_TV=1 expo prebuild` in `apps/expo-multi-tv` |
| `vega_build()` | Builds `apps/vega` via Vega SDK toolchain |
| `eas_build(profile, platform)` | EAS Build invocation |
| `run_simulator(platform)` | Launch and wait for boot (Android TV emulator, Apple TV simulator, Fire TV via adb) |
| `capture_screenshot(screen_id)` | Drive D-pad to a screen, snapshot |
| `run_focus_check()` | Static lint: every interactive element is focusable + reachable via React TV Space Navigation |
| `run_smoke_test(flow_path)` | Maestro D-pad flow |
| `generate_asset(spec)` | Splash, icon, banner, placeholder via image model |
| `git_commit(message)` | Snapshot after each successful phase |

### Skill-management tools (the meta-loop)
These tools are what make the harness self-improving. The agent uses them when it notices a missing skill or has solved a novel pattern worth codifying.

| Tool | Purpose |
|------|---------|
| `request_skill_load(name)` | Pull a skill that wasn't auto-loaded for the current phase. Orchestrator validates the name against the `./skills/` index, loads the file into context for the next model turn, and logs the request. If the named skill doesn't exist, returns `{ok: false, error: "no such skill", suggested: [...nearest matches]}`. |
| `list_skills(scope?)` | Returns the index of available skills. `scope` is `core \| auto \| all`. Used when the agent is unsure what's available — usually triggered by error keywords in tool output. Cheap; safe to call. |
| `write_auto_skill(name, frontmatter, content)` | Create `./skills/auto/<name>.md`. Orchestrator validates frontmatter shape, checks name uniqueness, and rejects skills below the quality bar (e.g. < 500 chars, no anti-pattern section, no concrete example). On accept, commits to disk and updates the skill index for the rest of the run. |

**Determinism boundary:** the template provides ~80% of the code deterministically. LLM generation is reserved for theme customization, novel screens not covered by `shared-ui`, and content-shape adaptation (e.g. deciding tabs vs drawer when the manifest has many categories). The skill-management tools are how the harness *compounds* — every run can leave behind a skill that makes the next run faster.

---

## 8. Skill Library

Plain markdown files in `./skills/`. Loaded lazily into model context by phase. The agent can also **write new skills** when it solves a novel sub-problem (Hermes pattern).

### 8.1 Initial seed skills
The AmazonAppDev template already encodes many TV-UX concerns. The seed skill set is therefore lighter and more **template-aware**. Skills are loaded **lazily** by phase, except `meta.md` which is loaded on every turn so the agent knows the library exists.

| Skill file | Loaded for | Purpose |
|------------|-----------|---------|
| `meta.md` | **Every turn** | Tells the agent how to use the library; reuse-first rule; auto-skill creation trigger |
| `template-anatomy.md` | Any file-touching phase | Monorepo layout, where each file type belongs, Metro's platform resolution |
| `shared-ui-catalog.md` | Screen customization, add/remove screen | What components/screens exist; **reuse-before-generate** decision tree |
| `theming.md` | Brand application | `brand.json` → tokens; contrast rules; focus ring decision |
| `manifest-wiring.md` | Content injection | `content.json` → hooks → screens; validation rules; shape mismatches |
| `spatial-navigation.md` | New screen generation, focus-check failures | React TV Space Navigation patterns; focus tree gotchas |
| `vega-sdk.md` | Vega target build | Vega OS / Kepler runtime; `@amazon-devices/*` packages |
| `firetv-leanback.md` | Android TV / Fire TV FOS build | Manifest requirements; banner specs; D-pad center |
| `expo-tv-config.md` | Prebuild phase | `EXPO_TV=1`, plugin options, prebuild flow |
| `video-player.md` | Player customization, manifest validation | `react-native-video` config; HLS/DASH; DRM upgrade path |
| `eas-build.md` | EAS Build phase | TV profiles; local-vs-EAS decision |
| `10ft-ui.md` | New screen generation (not template reuse) | Type scale, contrast, safe areas, density |

### 8.2 Skill file format
```markdown
---
name: tv-focus-navigation
applies_to: [screen_generation, component_generation]
---

# TV focus navigation

## When this matters
...

## Patterns
- Use `TVFocusGuide` to define focus traps...

## Gotchas
- `FlatList` virtualization can drop focus...

## Code template
```tsx
...
```
```

### 8.3 Auto-skill creation
After ≥ 5 tool calls on a sub-problem the agent hasn't seen before, summarize the resolution into a new `SKILL.md`. Store under `./skills/auto/`. Future runs load it. The quality bar — would a fresh agent loading this cold make the right call? Is the anti-pattern section concrete? — is defined in `meta.md`.

---

## 9. Build/Verify Loop (Phase Machine)

Phases run sequentially. Each has its own retry budget and its own skill subset. `meta.md` is loaded for every phase.

| # | Phase | Skills loaded (in addition to meta) | Outputs | Retry on |
|---|-------|-------------------------------------|---------|----------|
| 1 | **Plan** | — | AppSpec | schema validation fail |
| 2 | **Clone template** | `template-anatomy` | Forked repo, deps installed | git/yarn error |
| 3 | **Metadata & branding** | `template-anatomy`, `theming`, `firetv-leanback` | Renamed app, theme tokens, logo/splash/banner | image-gen fail |
| 4 | **Manifest wiring** | `template-anatomy`, `manifest-wiring` | `content.json` injected, hooks bound | data-shape mismatch |
| 5 | **Screen customization** | `template-anatomy`, `shared-ui-catalog`, `spatial-navigation`, `10ft-ui` (only if new screen) | Reuse / add screens per AppSpec | typecheck, focus-check |
| 6 | **Drawer/navigation update** | `template-anatomy`, `shared-ui-catalog` | Route table reflects AppSpec | typecheck fail |
| 7 | **Prebuild (Expo app)** | `expo-tv-config`, `firetv-leanback` | Native projects for tvOS / Android TV / Fire TV FOS | prebuild error |
| 8 | **Static checks** | `spatial-navigation` (on focus-check fail) | tsc, lint, focus-check pass | any |
| 9 | **Local simulator build** | `expo-tv-config` | Running app on emulator/simulator | build error |
| 10 | **Vega build** (if targeted) | `vega-sdk` | `apps/vega` built via Vega SDK | Vega toolchain error |
| 11 | **Visual & smoke test** | `10ft-ui`, `video-player` (if player screen tested) | Screenshots + Maestro flow | flow fail |
| 12 | **EAS build** (optional) | `eas-build` | `.ipa` / `.apk` / Fire TV artifact | EAS error |
| 13 | **Package** | — | Zipped repo + artifacts + report | — |

### 9.1 Repair pattern
On phase failure: collect `{phase, tool, last_error, last_50_log_lines, relevant_file_excerpts}` → next LLM turn with instruction "fix this error, then re-run the failing tool." Cap at `max_retries_per_phase`. If still failing, mark phase degraded and continue (best-effort delivery).

### 9.2 Visual check (phase 10)
Drive a Maestro flow that D-pads through every screen; capture PNGs; pass each to a vision model with the prompt *"Does this look like a working TV app screen of type `<layout>`? Flag focus rings, empty states, overlapping text, off-screen content."* Treat flags as soft failures unless severe.

---

## 10. Outputs

In `./out/<run_id>/`:
```
out/<run_id>/
├── app/                  # generated source repo (git-init'd)
├── artifacts/
│   ├── tvos.ipa
│   └── androidtv.apk
├── screenshots/
│   ├── home.png
│   ├── detail.png
│   └── …
├── run.log               # every tool call, every model turn
├── spec.json             # the AppSpec produced by the planner
└── report.md             # human-readable summary
```

---

## 11. Tech Stack

- **Language:** TypeScript for the harness (matches the generated app's stack, easier shared types). Python is fine if preferred — Hermes uses it.
- **Model:** Anthropic API, model string `claude-opus-4-7` for planning + complex generation, `claude-haiku-4-5-20251001` for cheap edits/validation.
- **Base template:** `AmazonAppDev/react-native-multi-tv-app-sample` (monorepo, Yarn workspaces)
- **Build target stack (inherited from template):** Expo SDK 51, `react-native-tvos`, React Navigation, react-native-video, React TV Space Navigation, `@react-native-tvos/config-tv` plugin, Vega SDK (`@amazon-devices/*`) for Vega OS app
- **CI/build:** EAS Build (optional), local `expo prebuild` + simulator/emulator, Vega CLI for Vega target
- **Testing:** Maestro for D-pad flows, vision model for screenshot review
- **Storage:** Local filesystem only in v1

---

## 12. Implementation Phases (for Claude Code)

### Milestone 1: Skeleton + template clone (1–2 days)
- Repo layout, `TVAppHarness` class, `ToolRegistry`, `RunLog`, `SkillLibrary`
- 3 tools working: `clone_template`, `read_file`, `write_file`
- Skill loader implementation; load `meta.md` on every turn
- End-to-end test: run harness → fresh `react-native-multi-tv-app-sample` fork installed and renamed

### Milestone 2: Branding + manifest wiring (2–3 days)
- AppSpec schema + structured-output planner call
- `apply_theme`, `replace_assets`, `inject_content` tools
- Load `template-anatomy.md`, `theming.md`, `manifest-wiring.md`, `firetv-leanback.md` per their phases
- Smoke: theme + content from a sample brief render in the template's existing screens, Android TV emulator

### Milestone 3: Screen customization (2–3 days)
- `add_screen`, `remove_screen`, drawer route updates
- Reuse-first heuristic enforced via `shared-ui-catalog.md`
- Load `spatial-navigation.md` on focus-check failures; `10ft-ui.md` only when generating new (non-reused) screens
- Smoke: a brief that needs a new screen type gets one added without breaking existing screens

### Milestone 4: Build/Verify loop (3–4 days)
- `expo_prebuild`, `run_simulator`, `capture_screenshot`
- Static focus-check tool (React TV Space Navigation aware)
- Load `expo-tv-config.md` on prebuild, `spatial-navigation.md` on focus failures
- Repair loop on failure
- Smoke: full run from prompt to simulator screenshot for Android TV + Apple TV

### Milestone 5: Multi-platform parity (3–5 days)
- Fire TV (Fire OS) build path validated — load `firetv-leanback.md`
- Vega build path validated via `apps/vega` — load `vega-sdk.md`
- Video player customization path — load `video-player.md`
- Per-platform Maestro flows
- Web target sanity check

### Milestone 6: Polish + auto-skills (open-ended)
- Vision-model screenshot review
- Auto-skill creation: after 5+ tool calls on a novel sub-problem, write `./skills/auto/<name>.md` per the meta-skill rules
- `eas-build.md` integration for signed artifacts
- Cost telemetry, run reports

---

## 13. Open Questions

- **Content auth.** Does the manifest's `stream_url` need DRM? v1 says no; document the upgrade path.
- **Second target order.** After tvOS + Android TV: Fire TV (cheap, Android variant) or Tizen (different stack)?
- **Telemetry.** Bake in analytics SDK in v1, or leave a stub the user fills?
- **Localization.** Single-locale v1; how does the planner mark strings for future i18n?
- **Determinism cap.** What % of generated files should come from templates vs free LLM output to keep build success > 80%? Likely 60/40 in favor of templates.
- **Cost ceiling.** Per-run token budget — set hard cap or just warn?

---

## 14. Reference Material

- **`AmazonAppDev/react-native-multi-tv-app-sample`** — primary base template ([github.com](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample))
- `AmazonAppDev/react-native-multi-tv-helloworld` — minimal alternative starter (Yarn workspaces, Vega + Android TV + Apple TV)
- `AmazonAppDev/hello-world-fire-tv-react-native` — Fire TV minimal sample for reference
- Amazon Fire TV docs — "Get Started with React Native" and "Add TV Support to an Existing React Native Project"
- **Garry Tan, "Thin Harness, Fat Skills"** — design paradigm for the skill library: push intelligence up into markdown skills, push execution down into deterministic tools, keep the middle thin
- Hermes Agent (NousResearch) — open-source harness, file-based skill memory
- Claude Code — `QueryEngine` single-state-owner pattern
- `react-native-tvos` — Apple TV / Android TV fork of React Native
- Expo "Build Expo apps for TV" guide — continuous native generation for TV
- `@react-native-tvos/config-tv` — Expo config plugin for TV builds
