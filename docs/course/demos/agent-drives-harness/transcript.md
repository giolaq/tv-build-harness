# Transcript

This transcript captures the key-free portion of the agent-driving loop.

```sh
cd packages/harness
npx tsx src/index.ts schema --json
```

Result: the CLI returned a schema-versioned list of available input contracts.

```sh
npx tsx src/index.ts init ../../docs/course/demos/agent-drives-harness/input --force --json
```

Result: the CLI wrote `content.json`, `brand.json`, and `prompt.txt`, then returned `errors: []` and two `sparse_rail` warnings.

The agent then edited the scaffolded files into the committed sample under `input/`, preserving the sparse rails so the warning path remains visible.

```sh
npx tsx src/index.ts validate ../../docs/course/demos/agent-drives-harness/input --json
```

Result: validation returned `errors: []`. The warnings were kept intentionally so the lesson can show lint feedback.

```sh
npx tsx src/index.ts claude-run ../../docs/course/demos/agent-drives-harness/input --plan --json --max-cost 10
```

Result: the CLI returned a schema-versioned plan object. A real agent must show this plan and cost cap to the human before running.

Deferred live step:

```sh
npx tsx src/index.ts claude-run ../../docs/course/demos/agent-drives-harness/input --detach --yes --json --max-cost 10
npx tsx src/index.ts status <runId> --json
npx tsx src/index.ts logs <runId>
```

Reason deferred: no key-backed model run is available in this environment.
