# Security

TV Build runs model-authored code changes against a local app template. Treat harness inputs, skills, prompts, and fetched skill packs as code-adjacent assets.

## Community Skills Are Code

Risk: a skill is prompt injection into a code-executing model. A hostile skill can tell the model to fetch remote scripts, ignore project rules, leak files, or edit outside the intended task.

Mitigation: review skills as executable code. Before merging a skill, check:

- No instruction says to ignore system, developer, repo, or user instructions.
- No instruction fetches remote content unless the task explicitly needs it.
- No shell command goes beyond the skill's phase and documented task.
- No broad filesystem access, credential access, or environment dumping.
- Commands are concrete, bounded, and testable.
- Failure handling tells the agent to stop or report when the safe path is unclear.

## Remote Skill Fetching

`packages/harness/src/skill-fetcher.ts` reads `skills/remote-skills.json` when present. It fetches explicit GitHub raw files from configured `repo`, `branch`, `basePath`, and `skills[].path`, rewrites the frontmatter `name`, and stores them in `skills/.remote-cache/`.

Decision: this is not an arbitrary URL fetcher, so it is not gated behind a runtime flag. Any committed `skills/remote-skills.json` must be reviewed like dependency code. Prefer commit SHAs in the `branch` field for remote skill configs. If a future change supports arbitrary URLs, add a checksum or explicit opt-in flag before enabling it.

## Hostile Inputs

Risk: a malicious `content.json` can contain text such as "ignore previous instructions" inside titles or descriptions. The model will see that text during planning and content wiring.

Mitigation: `tv-build validate` warns on instruction-like content through `instruction_like_content`. This reduces accidental prompt injection, but it does not make hostile inputs safe. Keep structured facts in `content.json`; put app-building instructions in `prompt.txt`; review untrusted content before launching a live run.

## Secrets And Transcripts

Run `packages/harness/node_modules/.bin/tsx scripts/scrub.ts --check docs examples` before committing recordings, transcripts, fixtures, or demo assets. CI runs the same guard for docs and examples.
