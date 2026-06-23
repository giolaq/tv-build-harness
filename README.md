# TV App Harness

An AI-powered harness that turns a content manifest + brand kit into a buildable, multi-platform React Native TV app — in minutes, not weeks.

Point it at a JSON file describing your videos and a brand color palette. It plans the app, clones a proven TV template, brands it, wires your content, customizes screens and navigation, verifies the result compiles, builds for your target platforms, and runs a visual QA loop on the output.

![TV App Harness TUI](docs/tui-screenshot.png)

## Targets

**Android TV** | **Apple TV** | **Fire TV (FOS)** | **Fire TV (Vega)** | **Web**

## Quickstart

```bash
cd packages/harness
yarn install
npx tsx src/index.ts doctor                             # check prerequisites
npx tsx src/index.ts run --example cooking-shows        # Strands SDK mode (multi-provider)
npx tsx src/index.ts claude-run --example cooking-shows # Claude CLI mode (recommended)
```

## Architecture

The harness is ~80% deterministic (a proven template, mechanical checks, git snapshots) and ~20% LLM judgment (planning, branding, content wiring). Each phase is small, focused, and verified before the next one runs.

```
prompt.txt ──┐
content.json ├─► [plan] ► [scaffold] ► [branding] ► [content] ► [screens]
brand.json  ─┘      ► [creative_ui] ► [navigation] ► [verify] ► [build] ► [visual QA]
                 every phase: skills in → agent works → checks pass → git commit
```

### Core components

| Component | What it does | Where |
|---|---|---|
| **Pipeline engine** | Deterministic control flow: ordering, deps, retries, abort, resume | `src/pipeline-engine.ts` |
| **Executors** | Drive the LLM per phase (two modes: Claude CLI or Strands SDK) | `src/claude-orchestrator.ts`, `src/strands-orchestrator.ts` |
| **Skills** | Domain knowledge injected per phase (10-foot UI, theming, spatial nav) | `skills/*/SKILL.md` |
| **Verification** | Machine checks after each phase; failures feed back as retry context | `verify` blocks in phase config |
| **TUI** | Real-time Ink-based terminal UI with phase progress and detail views | `src/tui.tsx` |

### Pipeline phases

| Phase | Purpose | Tools used |
|---|---|---|
| `plan` | Generate AppSpec from prompt + content + brand | No tools (pure generation) |
| `scaffold` | Clone template, install deps, configure workspace | bash, git |
| `branding` | Apply brand colors, fonts, app metadata | read, edit, bash |
| `content` | Wire content manifest into data hooks + screens | read, write, edit |
| `screens` | Customize/create screens per AppSpec | read, write, edit |
| `creative_ui` | Visual polish — typography, animations, focus states | read, write, edit, bash |
| `navigation` | Configure drawer/tabs/hidden navigator | read, edit |
| `verify` | TypeScript compilation + focus checks | bash |
| `build_loop` | Web build verification, platform prebuild | bash |
| `visual_qa_loop` | Screenshot → grade → fix loop (10-foot UI rubric) | devtools, bash |
| `android_test_loop` | D-pad navigation testing on emulator | bash, adb |

## Two execution modes

| Mode | Command | SDK | Best for |
|------|---------|-----|----------|
| **CLI mode** | `claude-run` | Claude CLI subprocess | Production use — stable, battle-tested |
| **API mode** | `run` | Strands Agents SDK | Multi-provider, model experiments, benchmarking |

Both produce identical output structure in `out/<runId>/`.

## Model & provider configuration

The `run` command uses the [Strands Agents SDK](https://strandsagents.com/) which supports multiple LLM providers. Configure in `harness.config.json`:

```json
{
  "models": {
    "strandsProvider": {
      "provider": "openrouter",
      "modelId": "anthropic/claude-sonnet-4"
    }
  }
}
```

### Supported providers

| Provider | Config value | Auth | Example models |
|----------|-------------|------|----------------|
| **AWS Bedrock** | `"bedrock"` | `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` | `global.anthropic.claude-sonnet-4-6-v1` |
| **Anthropic** | `"anthropic"` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **OpenRouter** | `"openrouter"` | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4`, `z-ai/glm-5.2`, `google/gemini-2.5-pro` |
| **OpenAI** | `"openai"` | `OPENAI_API_KEY` | `gpt-4o` |

### Per-phase model override

Use different models for different phases:

```json
{
  "models": {
    "strandsProvider": {
      "provider": "openrouter",
      "modelId": "z-ai/glm-5.2"
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

### Environment variables

Create a `.env` file in `packages/harness/`:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
# or
ANTHROPIC_API_KEY=sk-ant-...
# or
AWS_PROFILE=your-profile
```

## Inputs

Your input directory needs one required file and a few optional ones:

| File | Required | Purpose |
|---|---|---|
| `content.json` | Yes | Videos, categories, featured items |
| `brand.json` | | Colors, font, logo |
| `design.json` | | Layout template, tile sizes, navigation style, focus style, mood |
| `screens.json` | | Explicit screen tree (planner follows it exactly) |
| `run.json` | | Target platforms, retry budgets, devtools mode |
| `prompt.txt` | | Natural-language brief for the planner |
| `harness.config.json` | | Provider, model, pipeline customization |

See `examples/` for complete working examples (cooking-shows, music-videos, fitness-tv, sports-live).

## Outputs

```
out/<runId>/
├── app/                   # The generated app — one git commit per phase
├── spec.json              # The planner's AppSpec
├── checkpoint.json        # Resume state
├── report.md              # Phase results, token usage, cost
├── run.log                # NDJSON audit trail
├── screenshots/           # Visual QA captures
├── prompt-<phase>.md      # Per-phase prompt (for debugging)
├── response-<phase>.txt   # Per-phase response or tool log
└── error-<phase>.txt      # Full stack trace on failure
```

## Skills system

Skills are domain knowledge files loaded per phase. They follow the [Strands Agents SDK skill format](https://strandsagents.com/docs/user-guide/concepts/plugins/skills/):

```
skills/
├── template-anatomy/SKILL.md    # File structure of the template
├── theming/SKILL.md             # Color system and typography rules
├── spatial-navigation/SKILL.md  # react-tv-space-navigation patterns
├── 10ft-ui/SKILL.md             # TV viewing distance design rules
├── creative-tv-ui/SKILL.md      # Visual personality per content type
└── ...
```

Skills are progressively disclosed — only names/descriptions are in the system prompt. Full instructions load on-demand when the agent requests them.

## Pipeline customization

Drop a `harness.config.json` in your input directory to override any phase:

```json
{
  "template": { "repo": "https://github.com/you/your-tv-template.git", "branch": "main" },
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

## CLI commands

| Command | What it does |
|---|---|
| `run [dir]` | Full pipeline via Strands SDK (multi-provider) |
| `claude-run [dir]` | Full pipeline via Claude CLI (recommended) |
| `doctor [--fix]` | Pre-flight checks with fix commands |
| `visual-qa` | Re-run visual QA on an existing app |
| `add-screen <Name>` | Add a screen to a generated app |
| `review [scope]` | TV-specific code review |
| `test-ui` | Drive the app in a visible browser |
| `replay <file>` | Replay a recorded run |
| `--resume [runId]` | Resume from last checkpoint |
| `--from-phase <name>` | Re-run from a specific phase |
| `--generate-only` | Skip build and QA phases |
| `--no-tui` | Plain console output |

## Verification system

The repo includes a statistically rigorous verification suite at `packages/verification/`:

```bash
cd packages/verification
npx tsx src/cli.ts run --spec=GS-01-simple    # run N times, compute Wilson CIs
npx tsx src/cli.ts compare --base=X --head=Y  # detect regressions
```

5 verification levels: structural checks, platform builds, smoke tests, content fidelity, and LLM-judge rubric scoring. See `packages/verification/README.md` for details.

## Development

```bash
cd packages/harness
yarn install
yarn typecheck         # tsc --noEmit
npx vitest run         # unit tests
```

## Repository structure

```
your-harness-repo/
├── packages/
│   ├── harness/           # The orchestrator, pipeline, tools, TUI
│   ├── verification/      # Statistical quality measurement suite
│   ├── shared-types/      # Types shared across packages
│   └── web-ui/            # Dashboard (Vite)
├── skills/                # Domain knowledge (Strands skill format)
│   ├── template-anatomy/SKILL.md
│   ├── theming/SKILL.md
│   └── ...
├── examples/              # Working input examples
│   ├── cooking-shows/
│   ├── music-videos/
│   ├── fitness-tv/
│   └── sports-live/
└── docs/                  # Architecture docs, bug analyses
```

## License

This project is licensed under the [MIT-0 License](LICENSE).
