# 04. Knowledge Injection

## The problem

Domain knowledge changes faster than model weights. TV focus behavior, template anatomy, and Vega tooling should be editable without retraining or rewriting every prompt.

Cost: free (reading).

## How this repo solves it

Skills are markdown files such as `skills/rn-spatial-navigation/SKILL.md`. Their index lives in `skills/README.md`.

The harness loads always-on meta knowledge plus phase-specific skills in `packages/harness/src/phase-context.ts:31`.

Strands mode exposes skills through a plugin in `packages/harness/src/phase-context.ts:224`. Claude CLI mode injects skill text directly into the prompt context.

Auto-skill guidance lives in `packages/harness/src/phase-context.ts`. The model is told to propose reusable notes only when the fix is general enough and not already covered. It must use the validated creation tool when available; otherwise it reports a candidate for human review instead of writing directly into the skill library.

The skill creation tool enforces safe names, valid phase scopes, substantive content, gotchas or anti-patterns, and a code example in `packages/harness/src/tools/skill-tools.ts`. Accepted candidates are indexed immediately and auto-load only for matching phases.

## Exercise

Open `skills/rn-spatial-navigation/SKILL.md`.

Then open `packages/harness/src/harness-config.ts:203` and confirm which phase loads that skill.

Cost: free (reading).

## Check yourself

Why are skills better than one huge prompt?

<details><summary>Answer</summary>

They are scoped, reviewable, and loaded only when relevant to a phase.

</details>

Where does Strands mode convert skills into an agent plugin?

<details><summary>Answer</summary>

`buildStrandsSkillsPlugin()` in `packages/harness/src/phase-context.ts:224`.

</details>

What stops auto-generated skills from becoming noise?

<details><summary>Answer</summary>

The validated tool requires a safe unique name, explicit phase scope, substantive guidance, gotchas or anti-patterns, and an example. Candidates still require human review because the harness does not yet measure recurrence or effectiveness.

</details>
