# Contributing

Use small PRs. Run the commands that match the files you changed, and paste the output summary in the PR.

## Add A Skill

1. Create `skills/<name>/SKILL.md`.
2. Add this frontmatter:
   ```yaml
   ---
   name: skill-name
   applies_to: [phase_name]
   ---
   ```
3. Write concrete guidance: decisions, commands, file paths, anti-patterns, and failure handling.
4. Review it with the skills-as-code checklist in `docs/security.md`.
5. Reference the skill from a phase in `packages/harness/src/harness-config.ts` or from an example `harness.config.json`.
6. How to test it: run `cd packages/harness && yarn test`.

## Add An Example

1. Create `examples/<name>/`.
2. Add `content.json`, `brand.json`, and `prompt.txt`.
3. Add `screens.json`, `design.json`, `run.json`, or `harness.config.json` only if the example needs them.
4. Keep custom phases and skills in config where possible; avoid harness source changes.
5. How to test it: run `cd packages/harness && npx tsx src/index.ts claude-run --example <name> --generate-only --no-tui`, or mark `[deferred: needs key]`.

## Add A Phase Via Config

1. Add `harness.config.json` to the input directory or example.
2. Add an object to `phases` with `name`, `prompt`, `insertAfter`, `skills`, and `verify` as needed.
3. Put custom prompt text in the config for one-off phases; use `packages/harness/prompts/` only for built-in phases.
4. Prefer existing verify checks from `packages/harness/src/verification.ts`.
5. How to test it: run the harness with `--config <path>` and then run `cd packages/harness && yarn test`.
