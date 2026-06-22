# TV App Harness

**An AI coding-agent harness that turns a content manifest + brand kit into a buildable, multi-platform React Native TV app — in minutes, not weeks.**

Point it at a JSON file describing your videos and a brand color palette. It plans the app, clones a proven TV template, brands it, wires your content, customizes screens and navigation, verifies the result compiles, builds for your target platforms, and runs a visual QA loop on the output.

```bash
cd packages/harness
yarn install
npx tsx src/index.ts doctor                            # check prerequisites
npx tsx src/index.ts claude-run --example cooking-shows
# ☕ 10–15 minutes later: out/<runId>/app is a branded, compiling TV app
```

Targets: **Android TV · Apple TV · Fire TV (FOS) · Fire TV (Vega) · Web**

## Why a harness?

Asking an LLM to "build me a TV app" from scratch produces plausible code that doesn't compile, files nothing imports, and broken D-pad navigation. This harness flips the ratio: **~80% deterministic** (a proven template, mechanical checks, git snapshots) and **~20% LLM judgment** (planning, branding, content wiring) — each phase small, focused, and verified before the next one runs.

```
prompt.txt ──┐
content.json ├─► [plan] ► [scaffold] ► [branding] ► [content] ► [screens]
brand.json  ─┘      ► [navigation] ► [verify] ► [build] ► [visual QA]
                 every phase: skills in → agent works → checks pass → git commit
```

The five ingredients (and where they live):

| Ingredient | What it does | Where |
|---|---|---|
| **Strong prior** | Start from a template that already works; the agent customizes, never invents | `harness.config.json` → `template.repo` |
| **Decomposition** | Ten phases, each with one job and its own prompt | `packages/harness/prompts/*.md` |
| **Knowledge injection** | Domain facts the model won't reliably know, loaded per phase | `skills/*.md` |
| **Verification** | Machine checks after every phase; failures feed back as retry context | `verify` blocks in the phase config |
| **Observability** | NDJSON audit log, per-phase git commits, replayable recordings, checkpoints | `out/<runId>/` |

## Quickstart

**Prerequisites:** Node 20+, Yarn, Git, and either the [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (for `claude-run` mode) or an `ANTHROPIC_API_KEY` (for `run` mode). `npx tsx src/index.ts doctor --fix` tells you exactly what's missing and how to fix it.

```bash
# Generate from a bundled example (cooking-shows, music-videos, fitness-tv, sports-live)
npx tsx src/index.ts claude-run --example cooking-shows

# Generate from your own inputs
npx tsx src/index.ts claude-run ./my-app-inputs

# Code only, skip native builds and visual QA
npx tsx src/index.ts claude-run --example cooking-shows --generate-only

# A phase failed halfway? Resume from the last checkpoint
npx tsx src/index.ts claude-run --resume

# Re-run from a specific phase of a previous run
npx tsx src/index.ts claude-run --resume <runId> --from-phase navigation
```

### Inputs

Your input directory needs one required file and a few optional ones:

| File | Required | Purpose |
|---|---|---|
| `content.json` | ✅ | Videos, categories, featured items |
| `brand.json` | | Colors, font, logo |
| `design.json` | | Layout template, tile sizes, navigation style, focus style |
| `screens.json` | | Explicit screen tree (the planner follows it exactly) |
| `run.json` | | Target platforms, retry budgets |
| `prompt.txt` | | Natural-language brief for the planner |
| `harness.config.json` | | Customize the pipeline itself (see below) |

### Outputs

```
out/<runId>/
├── app/                # The generated app — one git commit per completed phase
├── spec.json           # The planner's AppSpec
├── checkpoint.json     # Resume state
├── report.md           # Phase results, token usage, cost
├── run.log             # NDJSON audit trail of everything that happened
├── screenshots/        # Visual QA captures
└── visual-qa-report.md # 10-foot UI defect analysis
```

## Make it yours: `harness.config.json`

The entire pipeline is data. Drop a `harness.config.json` in your input directory (or pass `--config <path>`) to swap the template, change skills, tune models, add phases — **no source changes**.

```jsonc
{
  // Bring your own template — any repo the skills describe
  "template": { "repo": "https://github.com/you/your-tv-template.git", "branch": "main" },

  // Route models per concern (API mode) or per phase (claude-run, via phases[].model)
  "models": { "plan": "claude-opus-4-6", "execution": "claude-sonnet-4-6" },

  "tokenBudget": 500000,

  "phases": [
    // Override any field of a built-in phase by name…
    { "name": "branding", "skills": ["template-anatomy", "my-design-system"], "retries": 3 },

    // …or add your own phase with its own prompt, skills, and machine checks.
    // Prompt file: prompts/analytics.md in your project (project prompts/ wins over built-ins)
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

Verify check types: `file_exists`, `grep` (with `{{brand.primary_color}}`-style variables), `git_dirty`, `tsc`, `focus_check`, `command`.

Skills are plain markdown in `skills/` with `name:`/`applies_to:` frontmatter — write one for whatever your template or domain needs and reference it from a phase's `skills` list. The agent can also load skills on demand and even write its own (quality-gated) during runs.

## Model & Provider Configuration (Strands SDK)

The `run` command uses the [Strands Agents SDK](https://strandsagents.com/) which supports multiple LLM providers. Configure the provider and model in `harness.config.json`:

```jsonc
{
  "models": {
    // Legacy model names (used by claude-run CLI mode)
    "plan": "claude-opus-4-6",
    "execution": "claude-sonnet-4-6",

    // Strands SDK provider config (used by `run` API mode)
    "strandsProvider": {
      "provider": "bedrock",      // "bedrock" or "anthropic"
      "modelId": "global.anthropic.claude-sonnet-4-6-v1",
      "region": "us-west-2",     // required for bedrock
      "temperature": 0.7,         // optional
      "maxTokens": 8192           // optional
    }
  }
}
```

### Supported providers

| Provider | Config | Auth |
|----------|--------|------|
| **AWS Bedrock** | `"provider": "bedrock"` | `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |
| **Anthropic Direct** | `"provider": "anthropic"` | `ANTHROPIC_API_KEY` env var |

### Bedrock model IDs

```
global.anthropic.claude-opus-4-6-v1        # Opus (plan phase)
global.anthropic.claude-sonnet-4-6-v1      # Sonnet (execution phases)
us.anthropic.claude-haiku-4-5-20251001-v1  # Haiku (fast/cheap)
us.meta.llama4-maverick-17b-instruct-v1    # Llama (experimental)
```

### Two execution modes

| Mode | Command | SDK | Use case |
|------|---------|-----|----------|
| **CLI mode** | `claude-run` | Claude CLI subprocess | Recommended — stable, battle-tested |
| **API mode** | `run` | Strands Agents SDK | Multi-provider, configurable, benchmarking |

Both produce identical outputs in `out/<runId>/`. The CLI mode uses the Claude CLI binary; the API mode calls the LLM provider directly via the Strands SDK.

## All commands

| Command | What it does |
|---|---|
| `claude-run [dir]` | Full pipeline via the Claude CLI (recommended) |
| `run [dir]` | Full pipeline via the Strands Agents SDK (multi-provider) |
| `doctor [--fix]` | Pre-flight checks, with exact fix commands |
| `visual-qa` | Re-run only the visual QA loop on an existing app |
| `add-screen <Name> --type=<layout>` | Add a screen to a generated app |
| `review [scope]` | TV-specific code review (focus, 10ft UI, platform quirks) |
| `test-ui` | Drive the app in a visible browser |
| `replay <file>` | Replay a recorded run, turn by turn |
| `install-skills` / `update-skills` | Sync remote skill packs |

## How it works

Read [`packages/harness/ARCHITECTURE.md`](packages/harness/ARCHITECTURE.md) for the full design and [`packages/harness/FEATURES.md`](packages/harness/FEATURES.md) for the feature reference. The short version:

- A **pipeline engine** (`src/pipeline-engine.ts`) owns the deterministic control flow: ordering, dependency blocking, retries with error context, abort-on-plan-failure, resume. It's plain code — fully unit-tested without a model.
- **Executors** do the stochastic work: `claude-run` spawns the Claude CLI per phase; `run` drives the Messages API with typed tools.
- **Phases are config** (`src/harness-config.ts`): prompt + skills + model + timeout + verify checks. The built-in TV pipeline is just the default config.
- **Skills** (`skills/*.md`) carry the domain knowledge — monorepo anatomy, theming rules, spatial navigation patterns, 10-foot UI rules, platform quirks — injected only into the phases that need them.

## Development

```bash
cd packages/harness
yarn test        # vitest — engine, config, verification, types, skills
yarn typecheck
yarn verify      # both
```
