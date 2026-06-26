# TV Build Verification System

A statistically rigorous verification suite for the TV Build. Measures harness quality as **rates over N repeated runs with 95% Wilson confidence intervals**, not single pass/fail results.

## Quick start

```bash
# Run the simplest golden spec (3 repeats by default)
npx ts-node src/cli.ts run --spec=GS-01-simple

# Run all specs
npx ts-node src/cli.ts run --spec=all

# Compare two run bundles
npx ts-node src/cli.ts compare --base=artifacts/run-baseline.json --head=artifacts/run-latest.json

# Show metrics from a bundle
npx ts-node src/cli.ts report artifacts/run-latest.json
```

## Architecture

```
packages/
  shared-types/    ← Types shared between harness and verification
  verification/    ← This package (read-only — never modifies apps)
    src/
      cli.ts           CLI entry point
      runner.ts        N-repeat runner with infra retry + tier depth
      harnessClient.ts Adapter wrapping the harness CLI
      levels/
        structural.ts  Level 1: file tree, nav, theme, focus, tsc
        build.ts       Level 2: per-platform build + error classification
        smoke.ts       Level 3: web server boot, page load, focus infra
        content.ts     Level 4: content manifest vs generated data
        rubric.ts      Level 5: LLM judge (4 dimensions, 0-2 scale)
      stats/           Wilson CI, z-test, Fisher, Mann-Whitney, Holm
      report/          Aggregation + version comparison
    tests/
      golden/          Golden specs (GS-01 through GS-08)
      unit/            Stats unit tests
    artifacts/         Run bundles (gitignored)
```

## Key design decisions

1. **Verification is read-only.** It never edits the app or feeds fixes back into generation. An evaluator that also fixes code cannot impartially grade it.

2. **Every metric is a rate with a confidence interval.** Wilson score intervals, not point estimates. This matters because the harness is non-deterministic (LLM in loop).

3. **infra_error ≠ harness_failure.** Emulator crashes and API timeouts are infra errors — retried up to `infraRetryMax` and excluded from rate denominators. Genuine harness failures are never retried.

4. **Verification depth is tiered.** Easy specs get Levels 1-2 only. Medium gets 1-4. Hard gets 1-5 (including LLM judge). Don't burn emulator/judge cost uniformly.

## Verification levels

| Level | Name | What it checks | Cost |
|-------|------|---------------|------|
| 1 | Structural | File tree, nav routes, theme tokens, focus nodes, TypeScript compilation | Free (static) |
| 2 | Build | Platform-specific build commands (prebuild, export, kepler build) | Minutes |
| 3 | Smoke | Web server boot, page load, bundle errors, focus infrastructure | Seconds |
| 4 | Content | Input content manifest vs generated data layer fidelity | Free (static) |
| 5 | Rubric | LLM judge scoring: intent, layout, theme, visual (0-2) | ~$0.02/run |

## Golden specs

| ID | Tier | Description | Example |
|----|------|-------------|---------|
| GS-01-simple | Easy | Single-screen basic app | cooking-shows |
| GS-02-multi-rail | Easy | Multi-rail home + detail, shared-ui reuse | cooking-shows |
| GS-03-cross-screen-focus | Medium | Cross-screen focus isolation with drawer | sports-live |
| GS-04-heavy-theming | Medium | Spotlight template, glow focus, deep theming | music-videos |
| GS-05-content-at-scale | Medium | 12 videos across 4 categories, tabs nav | fitness-tv |
| GS-06-nav-integrity | Medium | Navigation graph consistency | cooking-shows |
| GS-07-multi-platform | Hard | Android TV + Apple TV + Web build parity | sports-live |
| GS-08-full-parity | Hard | All platforms + rubric scoring | sports-live |

## Adding a golden spec

1. Create `tests/golden/GS-XX-name/spec.json`:
```json
{
  "id": "GS-XX-name",
  "name": "Human-readable name",
  "description": "What this tests and why",
  "tier": "easy|medium|hard",
  "inputDir": "../../../examples/<example>",
  "expected": {
    "files_exist": [...],
    "nav_routes": [...],
    "platforms_build": [...],
    ...
  }
}
```

2. Run it once: `npx ts-node src/cli.ts run --spec=GS-XX-name`

3. **Manually verify the first run** before trusting the assertions. A wrong `expected.json` produces confident false results.

4. PR-review the spec like code — golden specs encode beliefs about correct output.

## Pinning discipline

Every `RunRecord` captures:
- Model versions (plan + execution)
- Template repo + branch
- Node.js version
- Claude CLI version
- Harness git commit
- Timestamp

When rates move with no code change, check: did the model change? (Provider non-stationarity is the #1 confound.)

To pin the template at a specific commit:
```json
// harness.config.json
{ "template": { "repo": "...", "branch": "v1.0.0" } }
```

## PR vs nightly split

Set in `verify.config.json`:

```json
{
  "n": 3,           // PR: fast, low N
  "perSpecN": {
    "GS-08-full-parity": 5  // Override for specific specs
  }
}
```

- **PR job:** Levels 1-2 only (fast, deterministic). Fail on regression vs base CIs.
- **Nightly/pre-release:** All levels including 3-5. Higher N for statistical power.

## Regression rule

A regression is flagged when **head's lower 95% CI bound falls below base's point estimate**. This is stricter than "overlapping CIs" and avoids the common mistake of treating overlap as "no regression."

Implemented in `src/report/compare.ts`. Multiple comparisons corrected via Holm-Bonferroni.

## infra_error vs harness_failure policy

| Outcome | Retry? | Counted in rate? | Examples |
|---------|--------|-----------------|----------|
| `pass` | — | Yes (numerator) | All checks pass |
| `harness_failure` | **Never** | Yes (denominator only) | TSC fails, missing files, build error |
| `infra_error` | Up to `infraRetryMax` | **No** (excluded from denominator) | API timeout, emulator crash, rate limit |

Retrying a genuine failure is p-hacking. Counting infra noise as failure pollutes CIs.

## Tiering policy

Each golden spec declares a `tier`. The `tierLevelMap` in config controls depth:

```json
{
  "tierLevelMap": {
    "easy": [1, 2],
    "medium": [1, 2, 3, 4],
    "hard": [1, 2, 3, 4, 5]
  }
}
```

Deep levels give little signal on easy specs and most signal on hard ones.

## LLM judge calibration

The Level 5 judge is **gated behind validation**. Until validated:
- Scores are marked `[UNVALIDATED]`
- Dimensions fall back to human evaluation

Validation requires:
1. ≥20 human-rated runs stored in artifact bundles
2. Cohen's κ ≥ 0.6 and Spearman's ρ ≥ 0.7 vs human ratings
3. Run `calibrate()` from `src/levels/rubric.ts` to compute agreement

The judge prompt is tuned to be **skeptical** — it explicitly counters the tendency of LLMs to over-praise LLM output.

## Model-release re-examination workflow

When a new model lands:

1. **Re-run** the full suite with the new model:
   ```bash
   npx ts-node src/cli.ts run --spec=all
   ```

2. **Ablation:** For each harness component (a skill, a prompt scaffold), remove it and re-run. If pass-rate CIs hold without it → removable overhead.

3. **Record** what was removed and before/after rates as a changelog entry.

This turns provider drift from a threat into routine maintenance.

## Rubric versioning (Risk 7)

Every `RubricScore` carries a `rubricVersion` string. If rubric definitions change, comparisons across versions are **flagged, not silently mixed**.

Current version: `1.0.0`

Dimensions:
- **Intent** (0-2): Does the app match the spec's purpose and screens?
- **Layout** (0-2): TV-quality layout (safe zones, text size, hierarchy)?
- **Theme** (0-2): Brand colors/fonts applied consistently?
- **Visual** (0-2): Focus indicators, animations, polish?

Per-dimension **hard thresholds**: if any single dimension falls below its threshold, the spec fails regardless of the average.

## Source of truth

`DISCOVERY.md` in this package documents the real harness entrypoint, tools, platforms, and generated app anatomy. When this README and the code disagree, `DISCOVERY.md` is authoritative for facts about the harness.
