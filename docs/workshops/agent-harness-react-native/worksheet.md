# Harness Worksheet

Use short, concrete answers. Start with one workflow that can finish in a single session.

## 1. Outcome

What should change?

```text
Example: Update one Android app module to a new API and produce a passing debug build.
```

What is outside scope?

```text
Example: Do not change server APIs, release signing, or other app modules.
```

## 2. Phases

List the smallest useful sequence.

| Phase | Change made | Independent check |
| --- | --- | --- |
| Example: migrate client | Update one API client | `./gradlew :app:compileDebugKotlin` |
| | | |
| | | |

## 3. Required knowledge

What does the model need to know? Where will each fact come from?

| Fact or rule | Source | Include in which phase? |
| --- | --- | --- |
| | | |

## 4. Failure and retry

What exact failure text should be sent into the retry for each phase?

```text

```

## 5. Human control

Where must a person review or approve the work?

```text

```

What is the time or cost cap?

```text

```

## 6. Evidence

What should the report contain so another developer can review the run?

```text
Example: plan, commits, commands, test output, costs, retries, and unresolved risks.
```

## 7. Your domain adapter

Replace the TV parts:

| TV workshop part | Your equivalent |
| --- | --- |
| TV adaptation skill | |
| Vega command adapter | |
| D-pad behavior check | |
