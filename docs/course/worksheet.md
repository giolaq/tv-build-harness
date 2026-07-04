# Harness Design Worksheet

Use this before writing code. Keep answers concrete enough that another engineer could turn them into config, prompts, skills, and checks.

## 1. Proven Starting Point

What existing app, template, repo, or artifact should the harness start from?

```text
Starting point:

Why it is trustworthy:

What must not be changed:
```

## 2. Smallest Phase Sequence

What is the shortest useful sequence of phases?

```text
Phase 1:
Phase 2:
Phase 3:
Phase 4:
Phase 5:
```

## 3. What The Model Does Not Know

What domain facts, stack conventions, APIs, gotchas, or platform rules must be injected?

```text
Fact or convention:
Where it comes from:
Which phase needs it:
```

## 4. Mechanical Verification Per Step

What can the harness check without judgment?

```text
Phase:
Check type:
Path or command:
Failure text to feed back:
```

## 5. What To Log

What would you need to debug, replay, or teach the run?

```text
Prompt artifacts:
Model response artifacts:
Usage/cost:
Screenshots or build output:
Per-phase commits:
```

## Config Skeleton

```jsonc
{
  // Use a proven base instead of asking the model to invent project structure.
  "template": {
    "repo": "https://github.com/your-org/your-template.git",
    "branch": "main"
  },
  "models": {
    "plan": "claude-opus-4-6",
    "execution": "claude-sonnet-4-6"
  },
  "tokenBudget": 500000,
  "phases": [
    {
      "name": "clone-template",
      "prompt": "clone-template",
      "skills": ["your-template-anatomy"],
      "cwd": "out",
      "verify": [
        { "type": "file_exists", "path": "package.json" }
      ]
    },
    {
      "name": "inject-content",
      "prompt": "inject-content",
      "insertAfter": "clone-template",
      "deps": ["clone-template"],
      "skills": ["your-content-model"],
      "cwd": "app",
      "verify": [
        { "type": "grep", "path": "src/", "pattern": "{{content.title}}" }
      ]
    },
    {
      "name": "verify",
      "verify": [
        { "type": "command", "run": "npm run build" }
      ]
    }
  ]
}
```
