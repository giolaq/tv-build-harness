# Build Your Own Harness

This guide maps each worksheet answer to the file you edit. The happy path does not require harness source changes.

## 1. Starting Point

Put your answer in `harness.config.json`.

Edit:

`examples/cooking-shows/harness.config.json`

Use the `template.repo` and required `template.commit` fields documented in `docs/inputs.md`.

If the generated app needs a different template shape, add a skill that explains the template before changing prompts.

## 2. Phase Sequence

Put your phases in `harness.config.json`.

Edit:

`packages/harness/src/harness-config.ts`

only when you are changing the built-in default pipeline for everyone.

For a project-specific harness, edit the example config instead and use `phases[].insertAfter`, `phases[].deps`, `phases[].cwd`, and `phases[].verify`.

## 3. Missing Domain Knowledge

Write skills.

Edit:

`skills/rn-template-anatomy/SKILL.md`

Use that structure for your new skill. Then reference it from the phase with `skills: ["your-skill-name"]`.

Skill frontmatter must include:

```yaml
---
name: your-skill-name
applies_to: [your-phase]
---
```

## 4. Phase Prompts

Write prompt files for project-specific phases.

Edit:

`packages/harness/prompts/content.md`

for a built-in prompt, or create `prompts/<name>.md` in your input directory for a project-local prompt. `createPromptLoader()` checks the run-local `prompts/` directory before bundled prompts in `packages/harness/src/run-context.ts`.

## 5. Mechanical Verification

Prefer declarative checks in config before writing source.

Available checks are defined in `packages/harness/src/harness-config.ts` and executed by `packages/harness/src/verification.ts`.

Use:

```json
{ "type": "file_exists", "path": "src/App.tsx" }
{ "type": "grep", "path": "src/", "pattern": "{{content.title}}" }
{ "type": "command", "run": "npm run build" }
```

## 6. Observability

Use existing artifacts before adding logging.

Read:

`packages/harness/src/recorder.ts`

`packages/harness/src/run-context.ts`

The harness already writes prompts, responses, reports, logs, recordings, and per-phase commits.

## Worked Case: Changelog Site

The non-TV example uses the same engine to generate a static changelog/docs site from release notes.

Worksheet mapping:

Proven starting point: a minimal static-site template.

Smallest phases: clone template, inject release notes, apply brand, verify build.

Missing knowledge: how release notes map to pages, navigation, and semantic changelog structure.

Mechanical verification: build command plus grep checks for release names and brand text.

What to log: generated prompts, report, build output, and commits per phase.

Read the worked example:

`examples/changelog-site/harness.config.json`

`examples/changelog-site/content.json`

`skills/changelog-static-site/SKILL.md`

`packages/harness/prompts/changelog_inject_content.md`

## Source Edit Gaps

None for the happy path. Use config, prompts, and skills only.

Source edits are still required when you add a new built-in verify check type, a new executor, or a new core CLI command.
