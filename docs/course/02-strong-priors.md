# 02. Strong Priors

## The problem

Models are generalists. They do not automatically know your template layout, TV focus rules, Vega constraints, or project conventions.

Cost: free (reading).

## How this repo solves it

The harness encodes priors in config, prompts, and skills.

Default phases live in `packages/harness/src/harness-config.ts:156`. Each phase names its prompt, skills, dependencies, retries, working directory, and verification checks.

Phase-specific skill loading happens in `packages/harness/src/phase-context.ts:31`, where the harness combines meta knowledge with `PhaseSpec.skills`.

Prompt instructions are generated in `packages/harness/src/phase-context.ts:146`. Notice the screen and navigation instructions force the agent to inspect existing files before editing.

The lesson: strong priors are not about making the model smaller. They make the task narrower.

## Exercise

Open `packages/harness/src/harness-config.ts:170`.

Trace the `branding` phase:

1. List its skills.
2. List its dependencies.
3. List its verification checks.

Cost: free (reading).

## Check yourself

Where are per-phase skills configured?

<details><summary>Answer</summary>

In each `PhaseSpec` in `packages/harness/src/harness-config.ts`.

</details>

Where are skill bodies injected into Claude CLI prompts?

<details><summary>Answer</summary>

`buildClaudeSkillContext()` in `packages/harness/src/phase-context.ts:31`.

</details>

What does a strong prior prevent?

<details><summary>Answer</summary>

It prevents the model from solving the wrong version of the problem, such as creating new files instead of editing the imported template files.

</details>
