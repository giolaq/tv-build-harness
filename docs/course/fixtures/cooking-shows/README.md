# Cooking Shows Replay Fixture

This is a synthetic contract fixture for deterministic, key-free CLI and workshop testing. It does not support published quality or cost claims.

```sh
cd packages/harness
npx tsx src/index.ts replay cooking-shows --json --speed 50
```

Seed: `workshop-android-v1`. Expected total: 4 turns, 900 tokens, $0.0600.

Replace this fixture with a scrubbed real run during a keyed release session and retain the same replay assertions.
