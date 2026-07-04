# Agent Drives Harness Demo

Status: partial transcript committed. The live detached run and final report are deferred because this environment does not include a key-backed generation run.

Intent:

> Build a compact web-first TV app input set for a release-notes channel that a workshop agent can validate and launch.

Files:

- `input/content.json`
- `input/brand.json`
- `input/prompt.txt`
- `transcript.md`

Replay command once a live run has been recorded:

```sh
cd packages/harness
npx tsx src/index.ts replay agent-drives-harness --json --speed 10
```

Before committing a completed transcript or recording, scrub it with the repository scrub script once T10.5 lands.
