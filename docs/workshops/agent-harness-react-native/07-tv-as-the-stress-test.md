# 7. TV as the Stress Test

## Goal

Check whether a user can complete one flow with a remote, not just whether the app builds.

## Do this

1. Open `packages/workshop-harness/skills/react-native-tv-adaptation/SKILL.md`.
2. Open `docs/workshops/agent-harness-react-native/checkpoints/vega-buildable/app/TV_VERIFICATION.md`.
3. Trace this flow through the checks and the app code:

```text
launch -> featured action has focus
       -> down enters the first rail
       -> left and right stop at boundaries
       -> select opens details
       -> back returns to the same card
```

4. Open `docs/workshops/agent-harness-react-native/fixtures/focus-failure/README.md`.
5. Find the failed focus-restoration evidence and explain what should be sent into a retry.
6. In the guarded app, find `hasTVPreferredFocus` and the `onFocus` handlers that track the current card.

## Why this matters

A screenshot shows one moment. It cannot prove that controls are reachable, boundaries work, or focus returns after Back.

## You are done when

You can name the expected focus target after every remote action and point to the recorded failure when one transition breaks.

## If blocked

Use the focus-failure fixture and `checkpoints/vega-buildable/`. A virtual device is not required for this lesson.
