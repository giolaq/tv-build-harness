#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/packages/harness" && yarn typecheck && yarn test)
(cd "$ROOT/packages/shared-types" && yarn build)
(cd "$ROOT/packages/verification" && yarn test && yarn build)
(cd "$ROOT/packages/mini-harness" && yarn typecheck && yarn build)
(cd "$ROOT/packages/web-ui" && yarn build)

"$ROOT/packages/harness/node_modules/.bin/tsx" "$ROOT/scripts/check-course-paths.ts"
"$ROOT/packages/harness/node_modules/.bin/tsx" "$ROOT/scripts/gen-input-docs.ts" --check
"$ROOT/packages/harness/node_modules/.bin/tsx" "$ROOT/scripts/check-example-links.ts" --domains-only
"$ROOT/packages/harness/node_modules/.bin/tsx" "$ROOT/scripts/check-resources.ts"
"$ROOT/packages/harness/node_modules/.bin/tsx" "$ROOT/scripts/scrub.ts" --check "$ROOT/docs" "$ROOT/examples"
