Clone the app template and set it up for development.

STEP 1: Clone the template.
Run: git clone --depth 1{{templateBranch}} {{templateRepo}} "{{appDir}}"
Run: rm -rf "{{appDir}}/.git"

STEP 2: Use the loaded skill to apply any template-specific setup steps.
The skill knows what the template requires (dependency resolution, config adjustments, build tool setup). Follow its instructions exactly.

STEP 3: Install dependencies.
Run: cd "{{appDir}}" && {{installCommand}}

STEP 4: Initialize a fresh git repo.
Run: cd "{{appDir}}" && git init && git add -A && git commit -m "initial template"

App name: {{appName}}
