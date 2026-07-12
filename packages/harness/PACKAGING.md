# Packaging

`@tv-build/core` publishes the compiled CLI and bundled prompt files.

Included in the npm package:

- `dist/` compiled JavaScript and declarations
- `prompts/` built-in phase prompts
- `resources/skills/` built-in TV and platform knowledge
- `resources/examples/cooking-shows/` synthetic starter inputs
- `resources/fixtures/cooking-shows/` key-free replay contract fixture
- package docs included by npm defaults and the package `files` allowlist

Not included:

- additional repo-level examples and course assets
- generated `out/`

When installed from npm, `tv-build` resolves built-in prompts from the package `prompts/` directory. Project-local prompts still resolve from `./prompts` in the current working directory first.

Project-local skills and examples override built-in resources. Installed resources provide the minimum complete authoring and replay workflow outside the repository.
