# 10. Build a Harness for Your Work

## Goal

Keep the pipeline and replace the TV-specific parts with one workflow from your own domain.

## Do this

1. Open [the worksheet](worksheet.md).
2. Write one small outcome that can finish in a single session.
3. Split it into the fewest useful phases.
4. Add one independent check to every phase.
5. List the facts the model needs and where they come from.
6. Decide what requires human approval, what cost limit applies, and what evidence to save.
7. Replace the TV skill, Vega adapter, and D-pad check with your domain equivalents.

Examples:

- Android release: update version, build, run tests, inspect APK, prepare release notes.
- API migration: update one client, compile, run contract tests, save migration evidence.
- Design-system change: update one component family, run visual checks, record changed screens.

## You are done when

Another developer can read your worksheet and answer:

- What will the harness change?
- What will it not change?
- How does each phase prove success?
- When does it stop?
- What can a human review later?

## If blocked

Start with two phases and one check per phase. A small loop you can test is more useful than a large design you cannot run.
