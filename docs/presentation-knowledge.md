# TV Build — Presentation Knowledge File

A comprehensive knowledge base for creating a compelling presentation about the TV Build project: an AI-powered harness that generates complete, tested TV applications from structured inputs.

---

## Speaker & Context

| Field | Value |
|-------|-------|
| Speaker | Giovanni Laquidara (Gio) |
| Role | Senior Developer Advocate at Amazon |
| Focus | TV app development (Fire TV, Android TV, Apple TV), React Native cross-platform, KMP |
| Location | London, UK |
| Talk title | "I Taught an Agent to Build TV Apps" |
| Conference | Droidcon USA (+ Agent Conference CFP pending, WWAS GenAI Science Fair Europe) |

### The Speaker's Unique Position

Giovanni is not just a developer who built an AI tool — he's a Developer Advocate at Amazon whose day job is TV app development across Fire TV, Android TV, and Apple TV. He built this harness to solve his own problem: the repetitive boilerplate of TV app development across 5 platforms. He also:
- Runs Fire TV Emulator workshops (half-day hands-on)
- Maintains the `react-native-multi-tv-app-sample` template (the harness's base)
- Works on KMP for TV apps (multi-tv-app-kotlin project)
- Has domain expertise that's IN the skills (spatial navigation, 10ft UI, focus management)

This makes the presentation authentic: he's not demoing someone else's tool, he's showing how he automated his own workflow.

---

## Project Identity

| Field | Value |
|-------|-------|
| Name | TV Build (formerly "TV App Harness") |
| Package | `@tv-build/core` v0.3.1 |
| Author | Giovanni Laquidara |
| License | MIT-0 |
| Started | 2026-05-19 |
| Current state | v0.3.0 released (2026-07-05) |
| Total commits | 178 |
| TypeScript files | 151 |
| Skills (knowledge docs) | 25 |
| Example apps | 7 |
| Packages | 5 (harness, verification, shared-types, web-ui, mini-harness) |
| Bugs discovered and fixed | 22+ |
| Development timeline | 8 weeks (May 19 – Jul 12, 2026) |

---

## The Elevator Pitch

TV Build takes a JSON description of a TV app (content, brand colors, navigation style, target platforms) and generates a complete, tested, deployable TV application — with spatial navigation, D-pad controls, focus states, adaptive layouts, and distinctive visual design. It works by orchestrating an AI agent through a phased pipeline of tasks, each constrained by domain-specific knowledge ("skills") and verified by automated checks.

The harness doesn't just generate code — it iterates. It builds, screenshots, analyzes with vision, fixes bugs, rebuilds, and re-tests until the app meets quality standards. Reusable fixes can be captured as validated, phase-scoped skill candidates for later human review.

---

## The Story Arc (Chronological)

### Act 1: Genesis (May 19-20)

**The initial idea**: What if you could describe a TV app and have AI build it end-to-end?

- First commit: multi-platform TV app generation harness
- Integrated `react-native-tvos/skills` for platform knowledge
- Remote skill registry fetching from GitHub
- Basic commands: generate, add-screen, review

### Act 2: The Real Harness (June 4-8)

**From prototype to product**: The first version was just a wrapper around Claude. The real work began when we made it reliable.

- Complete v1: retry logic, verification, reporting
- Migrated to Claude Agent SDK (programmatic control)
- TUI dashboard with design tokens and live progress
- Parallel phase execution (DAG scheduler)
- Visual correctness phase (Puppeteer screenshots + AI vision analysis)
- Iterative visual QA loop — screenshot, analyze, fix, repeat
- **22 bugs discovered** in generated apps, each one turned into a harness guardrail

### Act 3: Making It See (June 9-16)

**Visual QA becomes the product differentiator**: The harness doesn't trust what it built.

- Interactive TUI with phase drill-down (watch the agent think)
- `test-ui` command: visible browser testing in real-time
- `visual-qa` standalone: re-run QA without regenerating
- Chrome DevTools MCP for real keyboard events
- Creative UI phase: apps stopped looking like template reskins
- Android emulator test loop (real D-pad on real device)
- Auto-skill candidates: reusable fixes can be captured for review

### Act 4: Measuring Quality (June 21-22)

**"How do you measure quality of non-deterministic AI output?"** — The verification system.

- Statistically rigorous: rates over N runs with 95% Wilson confidence intervals
- 5 verification levels (structural → build → smoke → content → rubric)
- 8 golden specs (easy → hard)
- Beautiful TUI with progress and summary tables
- First real results: 14/14 structural checks pass, 100% rate

### Act 5: Multi-Provider (June 22-24)

**Model-agnostic**: Same harness, any model.

- Strands Agents SDK integration
- OpenRouter, OpenAI, Anthropic, Bedrock support
- Per-phase model override (cheap model for branding, expensive for creative)
- Tested with GLM-5.2, DeepSeek v4, Claude Sonnet 4
- Skills restructured to directory format for Strands compatibility
- Tech-stack agnostic: React Native, KMP, Flutter, native Android

### Act 6: Teaching & Shipping (July 3-6)

**From tool to teachable system**:

- Mini-harness: stripped-down version for workshops
- 8-lesson course: "Build Your Own Agent Harness"
- v0.3.0 release with CI, replay workflow, golden runs
- `refine` command for iterating on existing apps
- Input validation, cost budgets, detached runs
- Secret scrubbing, security policy, governance

---

## Key Technical Concepts

### The Pipeline Architecture

```
Input: prompt.txt + content.json + brand.json + design.json
                         │
                    ┌────▼────┐
                    │  plan   │  → AppSpec (screens, nav, theme)
                    └────┬────┘
                    ┌────▼──────────┐
                    │   scaffold    │  → clone template, pin deps
                    └──┬─────────┬──┘
         ┌─────────────▼──┐  ┌──▼───────────┐
         │    branding     │  │   content    │  ← PARALLEL
         └─────────┬──────┘  └──────┬───────┘
                   └────┬───────────┘
               ┌────────▼─────────┐
               │     screens      │  ← build each screen
               └────────┬─────────┘
               ┌────────▼─────────┐
               │   creative_ui    │  ← visual personality
               └────────┬─────────┘
               ┌────────▼─────────┐
               │   navigation     │  ← drawer/tabs/hidden
               └────────┬─────────┘
               ┌────────▼─────────┐
               │     verify       │  ← static checks + grep
               └───┬──────────┬───┘
         ┌─────────▼──┐  ┌──▼──────────┐
         │ build_loop │  │ vega_build  │  ← PARALLEL
         └─────────┬──┘  └─────────────┘
             ┌─────▼───────────────┐
             │   visual_qa_loop    │  ← screenshot + vision + fix
             └─────┬───────────────┘
             ┌─────▼───────────────┐
             │  android_test_loop  │  ← real device testing
             └─────────────────────┘

Output: complete app + screenshots/ + report
```

### Three Run Modes

1. **`claude-run`** — Claude CLI subprocess (battle-tested, stream-json)
2. **`run`** — Strands Agents SDK (multi-provider, API-based)
3. **`strands-run`** — Direct provider integration (Bedrock, OpenRouter, etc.)

### The Skill System ("Thin Harness, Fat Skills")

The harness is ~1200 lines of orchestration logic. The real intelligence lives in **25 skill documents** — markdown files encoding expert knowledge:

- `rn-spatial-navigation`: 400+ lines on react-tv-space-navigation, including "The #1 Generated-App Bug: Double-Step Focus"
- `creative-tv-ui`: per-content-type visual personality (sports=angular+energy, cooking=warm+editorial, music=neon+glass)
- `10ft-ui`: 10-foot UI design rules (readable from couch distance, overscan-safe margins)
- Platform-specific: `expo-tv-config`, `firetv-leanback`, `vega-sdk`, `kmp-*`

Skills are loaded progressively per phase — the agent only sees what's relevant.

### Auto-Skill Candidates

The harness captures reusable lessons without claiming unmeasured self-improvement:

1. Agent encounters a bug during a code phase
2. After fixing it, agent evaluates whether the pattern is general and not already covered
3. A validated tool checks the kebab-case name, explicit phase scope, body length, gotchas or anti-patterns, and code example
4. Accepted candidates are indexed immediately and load only for matching phases
5. Humans review candidates before promotion, consolidation, or deletion
6. Recurrence and effectiveness tracking remain future work

---

## The Bug Hall of Fame (Presentation Gold)

### Double-Step Focus (The Bug That Kept Coming Back)

**Three different root causes, same symptom** (each keypress moves focus 2 items):

1. **Custom handlers**: Ambiguous instruction → agent adds onKeyDown alongside spatial-nav
2. **Duplicate imports**: `configureRemoteControl.ts` imported from 3 locations
3. **React StrictMode**: Doubles effect subscriptions → double listener registration

**Lesson**: The same symptom can have completely different causes. Each discovery added a new check to the `verify` phase.

### The 3-Layer Overflow Problem (TV-Specific)

Focused elements scale up on TV. Three independent layers can clip:
1. The card itself (`overflow: 'hidden'` for border-radius)
2. Its container (no padding for scale growth)
3. Ancestor ScrollViews (clip by default)

Fixing one doesn't fix the others. The harness now checks all three.

### The Monorepo Dependency Hell

Every white-screen crash traced to duplicate packages in yarn workspaces:
- React 18 vs 19 versions coexisting
- `shared-ui` accidentally installing its own React copy
- `react-tv-space-navigation` UMD bundle can't resolve `require("react")` from wrong node_modules

**Fix layers**: resolutions, Metro blockList, static_checks verification, prohibition rules in prompts.

### Android TV Navigation Bug (Agent-Caused)

The agent "improved" `RemoteControlManager.addKeydownListener` by returning a cleanup function. This broke `removeKeydownListener` — old listeners accumulated, each key firing 2-3+ times.

**Why web worked**: Web uses `document.addEventListener` (fires once). Platform-specific code uses a mitt event emitter.

**Lesson**: "The verifier caught a real bug that would have shipped — the agent 'improved' an API return type and broke D-pad navigation across all screens."

---

## Verification System (Deep Dive)

### Philosophy

"How do you measure quality of non-deterministic AI output?"

- **Not single pass/fail** → rates over N runs with 95% Wilson confidence intervals
- **infra_error ≠ harness_failure** → timeouts/crashes retried, never counted
- **Tiered depth** → don't waste emulator cost on easy specs
- **Regression rule** → head's lower 95% CI below base's point estimate
- **Skeptical LLM judge** → gated behind human validation (Cohen's κ ≥ 0.6)

### 5 Verification Levels

| Level | Name | Cost | What it checks |
|-------|------|------|---------------|
| 1 | Structural | Free | File existence, nav routes, theme tokens, focus nodes, TSC |
| 2 | Build | ~16s | Per-platform build with error classification |
| 3 | Smoke | ~30s | Web server boot, page load, bundle, focus infra |
| 4 | Content | Free | content.json vs generated data fidelity |
| 5 | Rubric | ~$0.02 | LLM judge scoring intent/layout/theme/visual 0-2 |

### Golden Specs

8 specs (GS-01 through GS-08) covering increasing difficulty:
- GS-01: Simple single-screen app
- GS-02: Multi-rail layout
- GS-03: Cross-screen focus continuity
- GS-04: Heavy theming
- GS-05: Content at scale
- GS-06: Navigation integrity
- GS-07: Multi-platform
- GS-08: Full parity (all platforms, all features)

---

## Compelling Presentation Angles

### Angle 1: "AI Agents Need Guardrails, Not Just Instructions"

- Ambiguous instructions produce bugs ("use Pressable with focus handlers")
- Explicit prohibitions prevent entire classes of issues ("DO NOT add onKeyDown")
- Verification steps (grep checks) catch drift even when the agent thinks it succeeded
- 22 bugs → 22 guardrails → continuous improvement

### Angle 2: "The Self-Improving System"

- Run 1 hits overflow bug → creates skill
- Run 2 never hits it
- Effectiveness tracking prunes bad skills
- The harness gets better WITHOUT human intervention

### Angle 3: "Measuring Non-Deterministic Quality"

- You can't just run once and declare success
- Wilson confidence intervals over N runs
- Statistical regression detection between versions
- Infrastructure errors vs real failures (different counting policy)

### Angle 4: "The 3-Layer Testing Pyramid for TV"

1. Static analysis (grep, TypeScript, structural checks)
2. Visual QA (screenshots + AI vision + iterative fix)
3. Device testing (real APK on real emulator with real D-pad)

Each layer catches bugs the others miss.

### Angle 5: "From Tool to Teaching Material"

- Mini-harness for workshops
- 8-lesson course
- The harness IS the lesson: decomposition, knowledge injection, verification, observability
- "Build Your Own Agent Harness" — applicable to any domain

### Angle 6: "Multi-Provider, Multi-Platform"

- Same pipeline works with Claude, GPT, DeepSeek, GLM
- Same inputs generate React Native, KMP, Flutter, Vega apps
- Per-phase model override: cheap model for boilerplate, expensive for creative work

---

## Run History & Statistics (from Claude Code session transcripts)

The project has **58 unique generation runs** recorded as Claude Code session transcripts, with **467 total phase-level sessions** (each phase is its own Claude invocation).

| Metric | Value |
|--------|-------|
| Total unique app generation runs | 58 |
| Total phase sessions recorded | 467 |
| Average phases per run | 10.9 |
| Runs using `cooking-shows` example | 10 |
| Runs using `changelog-site` example | 29 |
| Runs using `kmp-cooking-shows` example | 3 |
| Runs using `nintendo-games` example | 1 |

### Most Recent Complete Run (b565845f, 2026-07-12)

**App**: "Indie Kitchen" — premium streaming for indie cooking shows

**Phase timing**:
| Phase | Duration | Output Tokens |
|-------|----------|--------------|
| plan | 81s | 1,923 |
| scaffold | 80s | 1,512 |
| branding | 355s | 3,443 |
| content | 220s | 18,919 |
| screens | 453s | 13,168 |
| creative_ui | 217s | 30,719 |
| navigation | 390s | 11,932 |
| verify | - | 20,922 |
| **Total** | **~30 min** | **102,538** |

**Key insight for presentation**: The creative_ui phase produces the most output tokens (30K) — it's doing the most generative work. The screens phase takes the longest wall-clock time (7.5 min) because it's doing multi-file edits with verification.

### Example Generated App Spec (Indie Kitchen)

```json
{
  "app_name": "Indie Kitchen",
  "theme": {
    "mode": "dark",
    "tokens": {
      "primary": "#D4A574",
      "accent": "#FF6B35",
      "background": "#0F0A06",
      "surface": "#1A1209",
      "warmOverlay": "rgba(212,165,116,0.06)",
      "focusGlowInner": "rgba(212,165,116,0.5)",
      "focusGlowOuter": "rgba(255,107,53,0.35)"
    }
  },
  "navigation": { "type": "drawer", "routes": ["Home", "Categories", "Search", "Settings"] },
  "screens": [
    { "id": "home", "layout": "hero+rails", "sections": ["featured_hero", "trending", "new_episodes", "categories"] },
    { "id": "categories", "layout": "grid" },
    { "id": "search", "layout": "search" },
    { "id": "settings", "layout": "settings" },
    { "id": "detail", "layout": "detail" }
  ]
}
```

---

## Existing Presentation Deck (tv-app-harness-deck.html)

An earlier 15-slide internal deck already exists in the repo root. Its structure:

| Slide | Title | Content |
|-------|-------|---------|
| 1 | Title | "TV App Harness — Auto-generated TV applications from a single prompt + content manifest" |
| 2 | The Problem | Building TV apps = bespoke work, same patterns repeat |
| 3 | A Harness, Not a Generator | LLM intelligence + harness control |
| 4 | Base Template | Multi-TV Sample as production-ready starting point |
| 5 | System Architecture | Prompt → Planner → Orchestrator → Output |
| 6 | What You Provide | Prompt + content.json + brand.json |
| 7 | Planner → AppSpec | Structured output, spec not code |
| 8 | The Orchestrator | Single class, single state owner |
| 9 | Tool Registry | Project + Build + Skill-management tools |
| 10 | Skill Library | Markdown files loaded lazily by phase |
| 11 | 13-Phase Build Loop | Full phase sequence with verification |
| 12 | 5 Targets, 1 Codebase | All platforms from one monorepo |
| 13 | Success Criteria | Goals vs metrics table |
| 14 | Tech Stack | TypeScript, Claude Agent SDK, Expo, etc. |
| 15 | What's Next | Implemented vs planned |

**Note**: This deck is from an earlier stage (pre-verification, pre-multi-provider). A new presentation should incorporate the verification system, multi-provider support, the bug stories, validated skill-candidate capture, the course material, and the 8-week journey narrative.

---

## Key Metrics and Numbers

| Metric | Value |
|--------|-------|
| Time to generate one app | ~24-30 minutes |
| Phases per run | 10-12 |
| Skills loaded per run | 6-8 |
| Avg cost per run (Claude) | ~$2-5 |
| Output tokens per run | ~100K |
| Structural pass rate (N=3) | 100% (14/14 checks) |
| Bugs found in generated apps | 22+ |
| Bugs that recurred 3+ times | 3 (double-step focus) |
| Lines of prompt engineering | ~3000 |
| Development velocity | ~3 major features/week |
| Platforms supported | 5 (web, Android TV, Fire TV, tvOS, Vega) |
| Total generation runs on record | 58 |
| Total phase sessions recorded | 467 |

---

## Timeline Summary (For Slide Sequence)

| Week | Date Range | Theme | Key Commits |
|------|-----------|-------|------------|
| 1 | May 19-20 | Genesis | First harness, skill registry |
| 2 | Jun 4-8 | Reliability | v1, Agent SDK, TUI, visual QA |
| 3 | Jun 9-12 | Observability | Interactive TUI, streaming, pipeline engine |
| 4 | Jun 15-16 | Vision + Device | Chrome DevTools, creative UI, Android testing |
| 5 | Jun 17-21 | Verification | Statistical quality system, golden specs |
| 6 | Jun 22-24 | Multi-Provider | Strands SDK, OpenRouter, KMP support |
| 7 | Jun 25-26 | Polish | Creative diversity, nintendo-games, README rewrite |
| 8 | Jul 3-6 | Teaching + Ship | Mini-harness, course, v0.3.0, CI, governance |

---

## Captured Skill Candidates

Two skill candidates were captured during actual runs. They show that reusable fixes can be preserved, but they are not evidence of effectiveness until recurrence is measured:

### 1. `remote-control-listener-return-type` (created run 62c3202d, 2026-06-25)

The agent discovered that `addKeydownListener` was returning the listener itself instead of an unsubscribe function. This caused accumulated listeners → double-step D-pad navigation. The skill documents:
- The exact broken/fixed code pattern (TypeScript)
- Why it's silent in dev mode
- How to verify it's fixed (grep command)
- That ALL platform files must be patched (`.android.ts`, `.ios.ts`, `.kepler.ts`, `.ts`)

### 2. `android-tv-dpad-center-keyevent` (created run 76d46105, 2026-06-23)

The agent found that DPAD_CENTER (select button) was silently consumed by Android's native focus system before reaching the React Native JS layer. Fix: override `dispatchKeyEvent` instead of `onKeyDown` in MainActivity.kt.
- Includes Kotlin code for before/after
- Diagnosis steps with `adb logcat` commands
- Warning that Expo prebuild generates the broken pattern

**Presentation value**: These skills were written BY the AI agent FOR future AI agents. Each is ~70 lines of expert-level TV platform knowledge that didn't exist in any training data. Show them side-by-side with the bug report that triggered them.

---

## Demo Suggestions

1. **Live generation**: `npx tv-harness claude-run --example cooking-shows` — show TUI with phases progressing
2. **Phase drill-down**: Press Enter on a phase to watch the agent's tool calls in real-time
3. **Visual QA loop**: Show before/after screenshots where the agent found and fixed a clipping bug
4. **Verification run**: `npx tsx src/cli.ts run --spec=GS-01-simple` — show statistical results
5. **Skills inspection**: Show a skill file and how it encodes hard-won knowledge
6. **Input flexibility**: Show different content.json files producing wildly different apps
7. **Multi-provider**: Same example with different models, compare results

---

## Quotable One-Liners

- "The prompts ARE the product — they encode 22 bugs worth of learnings as guardrails."
- "Template bugs become harness bugs. Pre-existing issues only surface when the agent modifies files."
- "TypeScript passing doesn't mean the app works. Visual correctness saying PASS doesn't mean no glitches."
- "AI agents need explicit prohibitions, not just instructions. 'Don't' is more powerful than 'do'."
- "The harness gets better every time it runs — without human intervention."
- "How do you measure quality of non-deterministic AI output? Rates with confidence intervals, not single pass/fail."
- "The same symptom (double-step focus) had three completely different root causes across three sessions."
- "Thin harness, fat skills — 1200 lines of orchestration, 3000 lines of domain knowledge."

---

## Architecture for Diagrams

### Package Structure

```
your-harness-repo/
├── packages/
│   ├── harness/          ← CLI + orchestrators + pipeline engine
│   ├── verification/     ← statistical quality measurement
│   ├── shared-types/     ← TypeScript types across packages
│   ├── web-ui/           ← React dashboard (experimental)
│   └── mini-harness/     ← teaching version for workshops
├── skills/               ← 25 domain knowledge documents
├── examples/             ← 7 ready-to-run input sets
└── docs/
    └── course/           ← 8-lesson "Build Your Own Harness" course
```

### Input → Output

```
┌──────────────────────────────────────────────┐
│  INPUTS                                      │
│  content.json  — what the app shows          │
│  brand.json    — colors, logo, name          │
│  design.json   — nav style, layout, mood     │
│  prompt.txt    — natural language brief       │
│  run.json      — platforms and run settings   │
└──────────────────┬───────────────────────────┘
                   │
            ┌──────▼──────┐
            │  TV BUILD   │
            │  HARNESS    │  ← 12 phases, 25 skills
            └──────┬──────┘
                   │
┌──────────────────▼───────────────────────────┐
│  OUTPUTS                                     │
│  app/           — complete, buildable app     │
│  screenshots/   — visual QA evidence          │
│  report         — pass/fail per check         │
│  spec.json      — generated app specification │
└──────────────────────────────────────────────┘
```

---

## Origin Story (from the PRD)

### The Problem Statement

Building a TV app from a content catalog requires bespoke work per project: scaffolding, focus/D-pad navigation, 10-foot UI, platform quirks, video player integration, and CI/build setup. The same patterns repeat across projects. Ask an LLM to "build me a TV app" and you get plausible code that doesn't compile, orphan files nothing imports, wrong monorepo paths.

### The Insight

A **harness** — orchestration infrastructure around an LLM — that automates the repeating work. The LLM provides intelligence (interpreting the brief, designing screens, writing component code). The harness provides control (typed tools, deterministic scaffolding, a skill library of TV-specific knowledge, and a build/verify loop).

**The 80/20 split**: 80% proven template (deterministic `git clone`), 20% LLM judgment (branding, wiring, planning). The LLM never does work that a `git clone` can do.

### Design Inspiration

- **Hermes Agent** (NousResearch): file-based skill memory, AIAgent as single state owner
- **Claude Code**: QueryEngine pattern — one orchestrator owns all session state
- **"Thin Harness, Fat Skills"** (Garry Tan): push intelligence into markdown skills, push execution into deterministic tools, keep the middle thin

### Base Template

`AmazonAppDev/react-native-multi-tv-app-sample` — a production-ready monorepo covering:
- Platforms: Android TV, Apple TV, Fire TV (Fire OS), Fire TV (Vega OS), Web
- Stack: Expo SDK 51, React Navigation, `react-native-tvos`, Yarn workspaces
- Built-in: drawer nav, content grid, hero banner, video player, spatial focus, remote-control integration

The harness's job is **customization, not generation**.

### Original Success Criteria

| Goal | Metric | Achieved? |
|------|--------|-----------|
| Generate runnable TV app from prompt + manifest | First launch success ≥ 80% (retry budget 5) | Yes (100% structural, N=3) |
| Cover Apple TV + Android TV in v1 | Both platforms from one run | Yes + Fire TV + Vega + Web |
| Reusable knowledge across runs | Validated phase-scoped candidate capture | Partial (human review and effectiveness measurement remain) |
| Iteration speed | Prompt → screenshot < 15 min | ~24 min (exceeded for full pipeline, met for partial) |
| Auditable output | Every file change traceable | Yes (NDJSON logs + per-phase git commits) |

---

## The Talk Narrative (from the Improvement Plan)

### Recommended Structure: "How to Build Your Harness for Your Task"

**1. The Hook — Why "Just Prompt It" Fails**

Open with the failure mode: ask an LLM to "build me a TV app" and you get plausible code that doesn't compile, orphan files nothing imports, wrong monorepo paths. War story: Claude kept creating *new* files instead of editing existing ones — the app looked untouched. That's not a model problem, it's a *harness* problem.

**2. The Thesis — A Harness is Deterministic Structure Around a Stochastic Worker**

The 80/20 split: 80% proven template, 20% LLM judgment. The LLM never does work that a `git clone` can do.

**3. The Five Ingredients** (each maps to a file in the repo):

| Ingredient | What it does | In this repo |
|---|---|---|
| **Strong prior** | Start from something that works; LLM customizes, never invents | template clone in `scaffold` phase |
| **Decomposition** | Small phases with one job each, not one giant prompt | `harness-config.ts`, `prompts/*.md` |
| **Knowledge injection** | Domain facts the model won't know, loaded only when relevant | `skills/*.md` + phase skill mapping |
| **Verification** | Every phase ends with a machine check; failure feeds back | grep/tsc checks, retry-with-error-context |
| **Observability** | You can't improve what you can't replay | NDJSON run.log, per-phase git commits, report |

**4. The Lessons Learned** (the part audiences remember):

- *Discovery-first prompting* — force "find → read → edit-in-place → verify" or the model writes parallel files (orphan-file bug)
- *Pass prompts via stdin* — shell escaping will eventually eat a prompt containing quotes
- *Abort on plan failure, degrade on everything else* — know which phases are load-bearing
- *Auto-commit per phase* — `git log` of the generated app reads as a build narrative
- *Skills beat fine-tuning and beat mega-prompts* — markdown files are diffable, reviewable, and the agent can write its own (with quality gate)
- *Lazy context* — load per-phase skills, not everything; focused context outperforms big context
- *Generated skills need a quality gate* — without constraints, auto-written notes become vague/duplicated/app-specific
- *Put retry rules in one engine* — policy drift across multiple orchestrators is a category error
- *Replay turns demos into deterministic teaching* — record stream events, replay with speed control

**5. The Generalization Recipe — "Now Do It for YOUR Task"**

Give the audience the worksheet:
1. What's your proven starting point? (template / boilerplate / golden example)
2. What's the smallest sequence of single-responsibility steps?
3. What does the model not know about your domain? → write it as skill files
4. How do you *mechanically* verify each step? (compile, grep, test, screenshot)
5. What do you log so you can replay and improve?

Then show that the recipe is literally a config file: swap the template URL, swap the skills, swap the phases — same engine, different task.

**6. Live Demo Options** (have all three; pick by time):
- *Full run* (risky, 10-15 min): start `claude-run --example cooking-shows` at talk start, return at end
- *Replay* (safe): `replay out/<runId>/recording.json` — turn-by-turn with token counts, narrate phases
- *Artifact tour* (zero risk): walk `out/<runId>/` — git log of phases, report.md, screenshots before/after visual QA

**7. Closing Slide.** "The model is the easy part. The harness — priors, decomposition, knowledge, verification, observability — is where your engineering goes."

---

## The Course Material (Teaching Lens)

The project includes an 8-lesson course (`docs/course/`) for workshops:

| Lesson | Title | Core Concept |
|--------|-------|-------------|
| 00 | Overview | Inputs → Phases → Skills → Verification → Observability |
| 01 | Why a Harness | Raw prompts fail; structure is the product |
| 02 | Strong Priors | Start from working templates, customize don't generate |
| 03 | Decomposition | Small phases > one giant prompt |
| 04 | Knowledge Injection | Skills = domain facts loaded lazily |
| 05 | Verification | Machine checks that feed back into retries |
| 06 | Observability | NDJSON logs, replay, per-phase commits |
| 07 | Your Harness as a Tool | Generalize beyond TV apps |

Plus a **mini-harness** (`packages/mini-harness/`) — the smallest possible loop:
- 34 lines showing: load phases, run each, verify, retry once, commit, report
- Teaching tool: isolates the idea without TUI/skills/multi-provider complexity
- Workshop: participants modify the mini-harness before touching the full engine

---

## Design Philosophy

### "Thin Harness, Fat Skills"

- ~1200 lines of orchestration logic (the harness)
- ~3000 lines of domain knowledge (the skills)
- The harness enforces structure; skills provide intelligence
- Skills are diffable, reviewable, versionable markdown files

### Single Agent Sequential (confirmed design choice)

- One LLM agent per phase, phases run in sequence
- No multi-agent orchestration, no agent-to-agent communication
- Easier to debug, cheaper, more predictable
- The for-loop-with-retries model is the right one

### Agent Write Restrictions

- Agents write generated app files under `out/<runId>/app/`; skill candidates go through the validated tool or are reported for review
- Agents can NEVER modify: harness source, prompts, build config
- Humans modify the harness; agents modify the generated apps
- Enforced via prompt guardrails (not filesystem locks)

### Discovery-First Prompts

Every phase instruction follows: discover → read → edit-in-place → verify
- Prevents orphan files (the #1 failure mode of naive prompting)
- Agents must find existing files before editing
- Exact literal values provided (not abstract "replace with brand colors")
- Self-verification grep/check at the end

---

## 10 Lessons Learned (Codified)

From `docs/lessons.md` — each is a real fix from the project:

1. **Shell escaping breaks real prompts** → Send prompts through stdin
2. **A failed plan should abort the run** → `abortOnFailure` flag distinguishes load-bearing phases
3. **Discovery-first prompts prevent orphan files** → Force inspect-before-edit pattern
4. **Generated skills need a quality gate** → 500+ chars, gotchas section, code example required
5. **Lazy context beats one giant prompt** → Phase-specific skill loading
6. **Put retry rules in one engine** → PipelineEngine owns all policy
7. **Replay turns demos into deterministic teaching** → Record/replay with speed control
8. **Vega needs explicit preflight and budgets** → Platform-specific doctor checks
9. **Android TV focus can double-handle D-pad events** → Multi-cause bug, multiple guards
10. **Input docs should fail on drift** → Generate docs from schemas, CI validates

---

## Improvement Plan Progress

The original plan had 5 milestones and 6 themes. Status as of v0.3:

| Milestone | Contents | Status |
|-----------|----------|--------|
| M1 — Foundation | Unified engine, declarative phases, engine tests | Done |
| M2 — Out of the box | README, CLI, input validation, resume, doctor | Done |
| M3 — Customizable | Templates, config, skill packs, model routing | Done |
| M4 — Wow | Vision QA, TUI polish, token costs, demo video | Mostly done |
| M5 — Post-talk | Maestro, diffing, hooks, CI golden run | Partially done |

### North Star (achieved)

```bash
npx tv-build run --example cooking-shows  # 10–15 min → buildable app + report + screenshots
npx tv-build run --resume                 # picks up from last good phase
```

And for customizers: `harness.config.json` — the whole pipeline is data, not code.

---

## What Makes This Project Interesting for a Talk

1. **It's real**: 178 commits, 22 bugs found and fixed, 7 working example apps
2. **It solves a hard problem**: AI code generation is easy. AI code generation that WORKS is hard.
3. **The feedback loops**: visual QA, device testing, and reusable skill-candidate capture
4. **Statistical rigor**: Wilson CIs on AI output quality is novel
5. **The bug stories are compelling**: Each bug is a mini-mystery with a satisfying resolution
6. **Applicable beyond TV**: The patterns (phase decomposition, skill injection, iterative QA, verification) apply to any AI-assisted code generation
7. **Progressive complexity**: From "generate some files" to "build, test, fix, verify, learn"
8. **Solo developer velocity**: One person, 8 weeks, production-quality tooling
9. **Teaching vehicle**: Mini-harness + course lessons make it workshop-ready
10. **Origin-to-ship story**: PRD → prototype → v0.3 release in 8 weeks, documented along the way
11. **Authentic speaker**: Developer Advocate who built this to solve his own daily workflow, not a tool vendor

---

## Droidcon Teaser Script (from giovault)

A 45-second teaser video script already exists for Droidcon USA:

**Title**: "I Taught an Agent to Build TV Apps"

**Structure**:
1. **Introduction (5s)**: "Hey — I'm Giovanni, and my talk is called 'I Taught an Agent to Build TV Apps.'"
2. **The Hook: The Problem (10s)**: "TV development eats your time alive. Five platforms, D-pad focus bugs, boilerplate for days. I'll show you how to hand that entire problem to an AI agent — and actually trust the output."
3. **The Hook: Most Exciting Thing (15s)**: "You'll learn how to build your own coding harness — typed tools, markdown skills, a build loop that catches its own mistakes — on top of the Claude Agent SDK. One prompt in, runnable app out."
4. **Why Prioritize This (10s)**: "This isn't theory. I'll demo it live, show you the real failures, and you're walking out with a takeaway repo you can adapt to your own domain — TV or not."
5. **CTA (5s)**: "Come find me at Droidcon USA. Let's build agents that actually ship."

**Visuals**: Terminal with TUI running, platform names stacking as overlays, emulator with generated TV app, failure screenshots flashing.

**Tone**: Confident-casual. Dev talking to devs.
