<div align="center">

# TV App Harness

**Give it a JSON. Get a TV app.**

An AI-powered pipeline that transforms a content manifest + brand kit into a fully buildable, multi-platform TV application — in minutes, not weeks.

[Getting Started](#getting-started) · [How It Works](#how-it-works) · [Examples](#examples) · [Configuration](#configuration)

</div>

---

<!-- TODO: Replace with a hero image/gif showing the pipeline in action -->
<!-- ![Hero](docs/hero.png) -->

## The Pitch

You have **content** (a catalog of videos, games, shows). You have a **brand** (colors, fonts, personality). You want a TV app on Android TV, Apple TV, Fire TV, and web — with proper D-pad navigation, 10-foot UI design, and a visual identity that doesn't look like a template.

The TV App Harness does exactly that:

```
content.json + brand.json + prompt.txt → fully built TV app
```

It doesn't generate throwaway prototypes. It produces **production-grade React Native apps** with spatial navigation, accessibility, theming, and platform-specific builds — all verified through automated visual QA.

<!-- TODO: Add a before/after or final app screenshot -->
<!-- ![Generated App](docs/app-screenshot.png) -->

## What It Generates

| | |
|---|---|
| **5 platforms** | Android TV, Apple TV, Fire TV (FOS + Vega), Web |
| **Real navigation** | D-pad spatial navigation via react-tv-space-navigation |
| **Unique visuals** | 5,760+ creative seed combinations — no two apps look alike |
| **Content-driven** | Your data, your categories, your hero images |
| **Verified output** | Type-checked, visually QA'd, focus-tested |

## Getting Started

```bash
git clone <this-repo>
cd packages/harness
yarn install

# Check prerequisites
npx tsx src/index.ts doctor

# Generate an app from the cooking-shows example
npx tsx src/index.ts claude-run --example cooking-shows
```

That's it. The TUI shows real-time progress through each phase:

![TUI Progress](docs/tui-screenshot.png)

### Your First Custom App

Create a directory with your content:

```bash
mkdir my-app && cd my-app
```

**`content.json`** — your videos/items:
```json
{
  "title": "My Streaming App",
  "categories": [
    { "id": "trending", "name": "Trending", "items": ["v1", "v2", "v3"] }
  ],
  "videos": [
    {
      "id": "v1",
      "title": "My First Video",
      "description": "A great video",
      "thumbnail_url": "https://example.com/thumb.jpg",
      "stream_url": "https://example.com/stream.m3u8",
      "stream_type": "hls",
      "tags": ["drama"]
    }
  ],
  "featured": ["v1"]
}
```

**`brand.json`** — your colors:
```json
{
  "name": "My App",
  "primary_color": "#6C5CE7",
  "accent_color": "#00CEC9",
  "background_color": "#0A0A12"
}
```

**`prompt.txt`** — describe the vibe:
```
A cinematic streaming app with a premium feel. Dark moody backgrounds,
neon accent glows on focus, editorial typography. The hero section should
feel like a movie premiere.
```

Run it:
```bash
npx tsx src/index.ts claude-run /path/to/my-app
```

## How It Works

The harness is **~80% deterministic** (proven template, mechanical checks, git snapshots) and **~20% LLM judgment** (planning, branding, creative decisions). Each phase is small, focused, and verified before the next one runs.

```
                    ┌─────────────────────────────────────────────────────┐
prompt.txt ──┐     │                                                     │
content.json ├─►  plan → scaffold → brand → content → screens           │
brand.json  ─┘     │     → creative_ui → navigation → verify → build    │
                    │     → visual_qa → android_test                     │
                    └─────────────────────────────────────────────────────┘
                         every phase: skills loaded → agent works
                                    → checks pass → git commit
```

### The Pipeline

| Phase | What Happens |
|-------|-------------|
| **plan** | AI generates an AppSpec (screens, navigation, data bindings) from your inputs |
| **scaffold** | Clones a battle-tested RN TV template, installs deps |
| **branding** | Applies your colors, fonts, surface hierarchy, app metadata |
| **content** | Wires your videos/items into data hooks the screens consume |
| **screens** | Customizes or creates screens per the AppSpec |
| **creative_ui** | The magic — typography, focus animations, atmospheric effects, visual signatures |
| **navigation** | Configures drawer/tabs with proper focus isolation |
| **verify** | TypeScript compilation, focus system integrity checks |
| **build_loop** | Web build, platform prebuild for native targets |
| **visual_qa_loop** | Screenshots every screen → grades against 10-foot UI rubric → fixes issues |
| **android_test_loop** | D-pad navigation testing on an emulator |

### Skills System

Each phase loads domain-specific knowledge ("skills") that teach the LLM how to work with TV UI:

- **Spatial Navigation** — react-tv-space-navigation patterns, focus roots, D-pad handling
- **Creative TV UI** — cinematic scrims, specular highlights, TV color physics, content-type personalities
- **10-Foot UI** — safe zones, minimum text sizes, contrast requirements
- **Template Anatomy** — where files live, how the monorepo is structured

Skills are progressively disclosed — only loaded when the agent needs them.

## Examples

| Example | Content | Visual Style |
|---------|---------|--------------|
| `cooking-shows` | Indie cooking videos | Warm editorial, golden tones, Playfair Display |
| `music-videos` | Music streaming | Neon glow, glass-morphism, Bebas Neue |
| `fitness-tv` | Workout videos | Athletic precision, sharp angles |
| `sports-live` | Live sports | High-energy, diagonal cuts, stadium feel |
| `nintendo-games` | Nintendo Switch games (live API) | Playful, bold red accent, game-box cards |
| `kmp-cooking-shows` | Same content, Kotlin Multiplatform | Native Compose TV output |

The `nintendo-games` example fetches real game data from Nintendo's public API:
```bash
cd examples/nintendo-games
node fetch-content.js  # refreshes content.json with latest games
```

## Two Execution Modes

| Mode | Command | When to Use |
|------|---------|-------------|
| `claude-run` | Claude CLI subprocess | **Recommended** — stable, battle-tested |
| `run` | Strands Agents SDK | Multi-provider experiments, benchmarking, cost optimization |

Both produce identical output in `out/<runId>/`.

### Resume & Retry

```bash
# Resume the latest run from where it failed
npx tsx src/index.ts claude-run --resume

# Resume a specific run from a specific phase
npx tsx src/index.ts claude-run --resume abc123 --from-phase verify

# Generate only (skip build and QA)
npx tsx src/index.ts claude-run --example cooking-shows --generate-only
```

## Configuration

### Provider Setup

The `run` command supports multiple LLM providers via [Strands Agents SDK](https://strandsagents.com/):

| Provider | Auth | Example Models |
|----------|------|----------------|
| **AWS Bedrock** | `AWS_PROFILE` | `global.anthropic.claude-sonnet-4-6-v1` |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **OpenRouter** | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4`, `deepseek/deepseek-v4-flash` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |

Configure in your example's `harness.config.json`:

```json
{
  "models": {
    "strandsProvider": {
      "provider": "openrouter",
      "modelId": "anthropic/claude-sonnet-4"
    },
    "phaseModels": {
      "visual_qa_loop": {
        "provider": "openrouter",
        "modelId": "anthropic/claude-sonnet-4"
      }
    }
  }
}
```

### Input Files

| File | Required | Purpose |
|------|----------|---------|
| `content.json` | **Yes** | Videos, categories, featured items |
| `brand.json` | | Colors, font family, logo |
| `design.json` | | Layout template, tile sizes, navigation style, mood |
| `screens.json` | | Explicit screen tree |
| `prompt.txt` | | Natural-language creative brief |
| `run.json` | | Target platforms, retry budgets |
| `harness.config.json` | | Provider, model, pipeline overrides |

### Pipeline Customization

Override phases, add custom ones, or change the template:

```json
{
  "template": {
    "repo": "https://github.com/you/your-tv-template.git",
    "branch": "main"
  },
  "tokenBudget": 500000,
  "phases": [
    { "name": "branding", "skills": ["template-anatomy", "my-design-system"], "retries": 3 },
    {
      "name": "analytics",
      "prompt": "analytics",
      "insertAfter": "content",
      "skills": ["template-anatomy"],
      "verify": [
        { "type": "grep", "pattern": "trackScreenView", "path": "packages/shared-ui/" },
        { "type": "tsc" }
      ]
    }
  ]
}
```

## Output Structure

```
out/<runId>/
├── app/                   # The generated app (one git commit per phase)
├── spec.json              # The planner's AppSpec
├── checkpoint.json        # Resume state
├── report.md              # Phase results, token usage, cost
├── run.log                # NDJSON audit trail
├── screenshots/           # Visual QA captures
├── prompt-<phase>.md      # Per-phase prompt (debugging)
└── response-<phase>.txt   # Per-phase LLM response
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `run [dir]` | Full pipeline (Strands SDK, multi-provider) |
| `claude-run [dir]` | Full pipeline (Claude CLI, recommended) |
| `doctor [--fix]` | Pre-flight prerequisite checks |
| `visual-qa` | Re-run visual QA on an existing app |
| `add-screen <Name>` | Add a screen to a generated app |
| `review [scope]` | TV-specific code review |
| `test-ui` | Drive the app in a visible browser |
| `replay <file>` | Replay a recorded run |
| `--resume [runId]` | Resume from checkpoint |
| `--from-phase <name>` | Re-run from a specific phase |
| `--generate-only` | Skip build and QA phases |
| `--no-tui` | Plain console output |

## Verification Suite

A statistically rigorous quality measurement system at `packages/verification/`:

```bash
cd packages/verification
npx tsx src/cli.ts run --spec=GS-01-simple     # Run N times, compute Wilson CIs
npx tsx src/cli.ts compare --base=X --head=Y   # Detect regressions
```

5 levels: structural checks → platform builds → smoke tests → content fidelity → LLM-judge rubric.

## Development

```bash
cd packages/harness
yarn install
yarn typecheck         # tsc --noEmit
npx vitest run         # unit tests
```

### Repository Structure

```
your-harness-repo/
├── packages/
│   ├── harness/           # Pipeline engine, executors, TUI
│   ├── verification/      # Statistical quality measurement
│   └── web-ui/            # Dashboard (Vite)
├── skills/                # Domain knowledge (loaded per phase)
│   ├── rn-spatial-navigation/
│   ├── creative-tv-ui/
│   ├── rn-theming/
│   └── ...
├── examples/              # Working input examples
│   ├── cooking-shows/
│   ├── nintendo-games/
│   ├── music-videos/
│   └── ...
└── docs/
```

## License

This project is licensed under the [MIT-0 License](LICENSE).
