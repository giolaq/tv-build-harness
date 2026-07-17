Clone the app template and set it up for development.

STEP 1: Clone the template.
Run: git clone {{templateRepo}} "{{appDir}}"
Run: cd "{{appDir}}" && git checkout --detach {{templateCommit}}
Run: rm -rf "{{appDir}}/.git"

STEP 2: Use the loaded skill to apply any template-specific setup steps.
The skill knows what the template requires (dependency resolution, config adjustments, build tool setup). Follow its instructions exactly.

STEP 3: Install dependencies.
Run: cd "{{appDir}}" && {{installCommand}}

STEP 3b: Fix React resolution for web platform.
The generated app lives inside the harness repo. Without a root-level
node_modules/react, the web bundler walks up the directory tree and resolves
React from the harness's node_modules — a different instance than the app's,
causing "Invalid hook call" crashes. Create symlinks at the app root pointing
to the expo app's copies:
Run: cd "{{appDir}}" && mkdir -p node_modules && ln -sf ../apps/expo-multi-tv/node_modules/react node_modules/react && ln -sf ../apps/expo-multi-tv/node_modules/react-dom node_modules/react-dom

STEP 4: Initialize a fresh git repo.
Run: cd "{{appDir}}" && git init && git add -A && git commit -m "initial template"

App name: {{appName}}
