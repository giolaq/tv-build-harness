# Packaging

`@tv-build/core` publishes the compiled CLI and bundled prompt files.

Included in the npm package:

- `dist/` compiled JavaScript and declarations
- `prompts/` built-in phase prompts
- package docs included by npm defaults and the package `files` allowlist

Not included:

- repo-level `skills/`
- repo-level `examples/`
- generated `out/`

When installed from npm, `tv-build` resolves built-in prompts from the package `prompts/` directory. Project-local prompts still resolve from `./prompts` in the current working directory first.

Skills and examples are project resources. Run commands from a repository or working directory that has `skills/` and input files, or pass an explicit input directory/config. Commands that only inspect the local machine or replay a file, such as `tv-build doctor` and `tv-build replay /path/to/recording.json`, do not need bundled examples or skills.
