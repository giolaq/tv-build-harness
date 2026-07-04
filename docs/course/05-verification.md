# 05. Verification

## The problem

You need two kinds of verification: checks that validate one generated run, and statistical tests that validate whether the harness itself is improving.

Cost: free (reading).

## How this repo solves it

One-run verification is declarative. `VerifyCheckSchema` in `packages/harness/src/harness-config.ts:7` defines checks such as `file_exists`, `grep`, `tsc`, `focus_check`, `forbidden_import`, and `command`.

The checks execute in `packages/harness/src/verification.ts:17`. Failures return text that the phase can feed back into a retry.

The default `verify` phase runs TypeScript and focus checks in `packages/harness/src/harness-config.ts:209`.

Harness-level verification is statistical. `packages/verification/src/stats/index.ts:1` exports Wilson intervals, proportion tests, Fisher exact tests, Mann-Whitney U, and Holm correction.

Use the first kind to ask, “Did this run work?” Use the second kind to ask, “Is this harness version better across many runs?”

## Exercise

Add this check mentally to a phase:

```json
{ "type": "grep", "path": "packages/shared-ui/", "pattern": "{{content.title}}" }
```

Find the code that substitutes `{{content.title}}` and the code that executes the grep.

Cost: free (reading).

## Check yourself

Where does template variable substitution happen?

<details><summary>Answer</summary>

`substituteVars()` in `packages/harness/src/verification.ts:13`.

</details>

Which file defines declarative per-phase checks?

<details><summary>Answer</summary>

`packages/harness/src/harness-config.ts`

</details>

When should you use `packages/verification`?

<details><summary>Answer</summary>

Use it when comparing harness versions over a suite of runs, not just validating one generated app.

</details>
