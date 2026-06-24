Build the app. Verify it compiles successfully for each requested platform.

Platforms requested: {{platforms}}

STEP 1: Verify the project type-checks.
Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1 | tail -10
Fix any errors before proceeding.

STEP 2: Build each requested platform.
Run: {{buildCommand}}

Use the loaded skill to get the exact build commands and environment variable requirements per platform. The skill knows the correct invocation for each target (web, Android TV, Apple TV, etc.).

For each platform, report: succeeded, skipped (tool not available), or failed (with error).
