# 04. Knowledge Injection

## The problem

Domain knowledge changes faster than model weights. TV focus behavior, template anatomy, and Vega tooling should be editable without retraining or rewriting every prompt.

Cost: free (reading).

## How this repo solves it

Skills are markdown files such as `skills/rn-spatial-navigation/SKILL.md`. Their index lives in `skills/README.md`.

The harness loads always-on meta knowledge plus phase-specific skills in `packages/harness/src/phase-context.ts:31`.

Strands mode exposes skills through a plugin in `packages/harness/src/phase-context.ts:224`. Claude CLI mode injects skill text directly into the prompt context.

Auto-skill guidance lives in `packages/harness/src/phase-context.ts:54`. The model is told to create reusable notes only when the fix is general enough and not already covered.

The skill creation tool enforces quality expectations in `packages/harness/src/tools/skill-tools.ts:72`.

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

The auto-skill guidance and tool contract require generality, duplicate checks, gotchas or anti-patterns, and examples.

</details>
