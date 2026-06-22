---
name: meta
description: "Meta skill loaded for all phases: project conventions, file modification rules, code quality standards"
applies_to: [all]
load_when: every turn
---

# How to use this skill library

> You have a skill library. **Use it.** This file is loaded on every turn so you remember it exists. The other skills are loaded by phase; you don't have to manage that — the harness does. Your job is to *consult* skills before acting, and to *write* new ones when you solve something that will come up again.

## The rule that everything else follows

**Before writing code or invoking a non-trivial tool, ask: is there a skill for this?**

If yes → read it, follow its decision tree, then act.
If no but the problem is recurring → solve it manually 3 to 10 times, then write a skill via `write_auto_skill`.
If no and the problem is one-off → just solve it. Don't pre-codify.

The harness will surface relevant skills in your context automatically based on the current phase. If you find yourself reasoning about a problem and no relevant skill is loaded, **don't guess** — call `request_skill_load(name)` to pull one, or `list_skills()` if you're not sure what's available. Both are cheap and safe.

## Tools you have for skill management

- **`request_skill_load(name)`** — pull a skill not auto-loaded for this phase. Use when you hit a problem that feels like it should have established guidance. If the name is wrong, the tool returns suggestions.
- **`list_skills(scope?)`** — see what's available. `scope` is `core | auto | all`. Call this when an error message contains a domain word you haven't seen before (e.g. "Vega," "leanback," "manifest schema") — there's probably a skill for it.
- **`write_auto_skill(name, frontmatter, content)`** — codify a learned pattern after solving it manually 3+ times. The harness validates frontmatter shape and quality before accepting. Rejections come with reasons; fix and retry.

## When to consult a skill (not just notice it's loaded)

The skill being in your context isn't enough. Actually open it and reason from it when:

- You're about to write a new file. → `template-anatomy.md` says where it goes.
- You're about to write a new screen. → `shared-ui-catalog.md` says whether to reuse instead.
- A focus / D-pad bug is reported. → `spatial-navigation.md` has the diagnostic tree.
- A build is failing. → `expo-tv-config.md` or `eas-build.md` has the symptom table.
- Anything touches Vega. → `vega-sdk.md`. Vega is not Android.
- You're applying brand colors / fonts. → `theming.md`. Don't eyeball contrast.

If you act without consulting and you were wrong, that's the failure mode this library exists to prevent.

## The inventory (one-line each)

- `template-anatomy.md` — where every file lives in the monorepo
- `shared-ui-catalog.md` — what components/screens already exist; **reuse before generating**
- `theming.md` — brand kit → theme tokens; contrast and typography rules
- `manifest-wiring.md` — content.json → hooks → screens; validation rules
- `spatial-navigation.md` — React TV Space Navigation patterns and focus debugging
- `vega-sdk.md` — Fire TV Vega OS (Kepler) — different runtime from Fire OS
- `firetv-leanback.md` — Android TV / Fire TV (Fire OS) manifest requirements
- `expo-tv-config.md` — `EXPO_TV=1`, prebuild, config plugin
- `video-player.md` — `react-native-video` and Kepler media; stream types
- `eas-build.md` — TV build profiles, when to use EAS vs local
- `10ft-ui.md` — type scale, contrast, safe areas — only for new screens

## Writing new skills (auto-skill creation)

After 5+ tool calls solving a novel sub-problem, call `write_auto_skill(name, frontmatter, content)` before moving on. The skill is stored at `./skills/auto/<name>.md`. Include:

1. **Frontmatter** with `applies_to` (which phase loads it) and `load_when` (human description).
2. **The decision** you made and why. Not the code — the judgment.
3. **The anti-pattern** you almost fell into. This is often the most valuable part.
4. **A concrete example** from this run as illustration.

Future runs load it automatically. The harness will probably never reach for that exact same novel problem twice; the value is in the *class* of problem the skill describes.

The orchestrator validates and may reject:
- Frontmatter missing `applies_to` or `load_when` → reject with reason.
- Body shorter than ~500 characters → reject as too thin.
- No "anti-pattern" or "do not" section → reject; the warning is half the value.
- Duplicate name → reject; pick a more specific name.

Read the rejection reason, fix, retry. Don't retry blindly.

### Quality bar for auto-skills

- Would a fresh agent, loading this skill cold, make the right call without further context? If no, expand.
- Is it specific enough to be useful but general enough to apply across similar tasks? If only useful for the one case, don't write it.
- Is the anti-pattern section concrete? "Don't be wrong" is not a skill. "Don't use `<TouchableOpacity>` for focusable elements because it responds to touch, not D-pad select" is a skill.

## What the harness handles, so you don't worry about it

- **Which skills are loaded.** Phase-based, automatic.
- **Tool dispatch.** You name tools; the harness executes.
- **State.** Iteration count, budget, file diffs — tracked.
- **Safety.** Tool permissions; you don't need to second-guess every action.

## What you handle

- **Reading the right skill at the right moment.** Not just having it in context.
- **Reusing template components and screens.** This is the highest-leverage habit.
- **Flagging when you need a skill that doesn't exist.** Don't fake it.
- **Writing new skills after you've solved something novel multiple times.**

## The reuse rule, restated

The base template (`AmazonAppDev/react-native-multi-tv-app-sample`) ships ~80% of a working TV app. Your job is *customization*, not *generation*. If you're writing a `<View>` with a `<FlatList>` and `<TouchableOpacity>`, stop. The template has `<Grid>`. Use it.

When you find yourself wanting to write from scratch, the question is always: **what existing component or screen am I about to reinvent?** If the answer is "nothing — this is genuinely new," then proceed (and load `10ft-ui.md` first). Otherwise, reach for the existing piece.

## Anti-patterns at the meta level

- **Skill loaded, not consulted.** A skill is not a flag; it's a process. Open it, follow it.
- **Generating instead of reusing.** Always the wrong default for this codebase.
- **Writing a skill from a single occurrence.** That's a one-off, not a pattern. Wait for the third.
- **Vague skills.** "Be careful with X" is not a skill. Specific decision trees and anti-patterns are.
- **Treating skills as documentation to read once.** They're programs to execute every relevant turn.
