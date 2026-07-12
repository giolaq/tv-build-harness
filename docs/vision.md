# TV Build Vision

TV Build turns versioned product inputs into a verified TV application through a deterministic, observable agent pipeline.

The primary users are developers and shell-capable agents building TV experiences. Android TV is the primary native reference platform. React Native TV and Kotlin Multiplatform with Compose TV are first-class stacks. Apple TV, Fire TV, Vega OS, and web integrate through explicit platform paths.

The pipeline, tools, verification, artifacts, and CLI contracts are the product. Model runtimes are replaceable executors.

## Support Tiers

- Tier 1: Claude CLI, Android TV, and web.
- Tier 2: Claude Agent SDK, Strands, Kotlin Multiplatform, and Vega OS.
- Experimental: the read-only web run explorer and remote skill fetching.

## Non-goals

- Do not become a general-purpose agent framework or IDE replacement.
- Do not promise equal feature parity across every model provider.
- Do not add autonomous remote skills or cross-run memory without a demonstrated failure class.
- Do not create a second orchestration state machine for the web UI.
