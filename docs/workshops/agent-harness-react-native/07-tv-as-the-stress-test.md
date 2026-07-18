# TV as the Stress Test

## The failure

A build can pass while a remote user cannot reach a control, see focus, go back, or recover their previous position.

## The mechanism

The TV skill makes navigation behavior explicit. Verification follows transitions rather than screenshots alone.

## Build it

For Pocket Cinema, write checks for:

```text
launch -> featured action focused
       -> enter first rail
       -> move left/right and stop at boundaries
       -> open details
       -> press back
       -> originating card focused again
```

Read `packages/workshop-harness/skills/react-native-tv-adaptation/SKILL.md`, then inspect the focus-failure fixture.

## Inspect the evidence

The fixture fails focus restoration. Trace that exact failure into the repair context and compare the before/after evidence.

## Checkpoint

Use `checkpoints/vega-buildable/` before device work.

## Fallback

Follow the recorded focus matrix and screenshots when VDA is unavailable.

## Check yourself

<details><summary>Why is a screenshot insufficient?</summary>It cannot prove directional reachability, boundaries, back, or focus restoration over time.</details>
