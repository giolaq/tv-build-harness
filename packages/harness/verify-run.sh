#!/bin/bash
# Verify a harness run produced correct output for each phase.
# Usage: ./verify-run.sh [runId]
#   If no runId given, uses the most recent run.

set -e

cd "$(dirname "$0")"

RUN_ID="${1:-$(ls -t out/ | head -1)}"
OUT="out/$RUN_ID"
APP="$OUT/app"

echo ""
echo "  Verifying run: $RUN_ID"
echo "  ════════════════════════════════════════"
echo ""

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label — $result"
    FAIL=$((FAIL + 1))
  fi
}

# Phase 1: Plan
if [ -f "$OUT/spec.json" ]; then
  APP_NAME=$(grep -o '"app_name": *"[^"]*"' "$OUT/spec.json" | head -1 | cut -d'"' -f4)
  SCREENS=$(grep -c '"id"' "$OUT/spec.json" 2>/dev/null || echo "0")
  check "Plan: spec.json exists (app: $APP_NAME, ~$SCREENS fields)" "ok"
else
  check "Plan: spec.json exists" "MISSING — plan phase failed"
fi

# Phase 2: Clone template
if [ -f "$APP/package.json" ]; then
  check "Clone: app/package.json exists" "ok"
else
  check "Clone: app/package.json exists" "MISSING — clone failed"
fi

if [ -d "$APP/packages/shared-ui" ]; then
  check "Clone: packages/shared-ui/ exists" "ok"
else
  check "Clone: packages/shared-ui/ exists" "MISSING"
fi

if [ -d "$APP/node_modules" ]; then
  check "Clone: node_modules installed" "ok"
else
  check "Clone: node_modules installed" "MISSING — yarn install may have failed"
fi

# Phase 3: Metadata & branding
BRAND_COLOR=$(grep -o '"primary_color": *"[^"]*"' "examples/cooking-shows/brand.json" 2>/dev/null | cut -d'"' -f4 || echo "#2D1B69")
BRAND_FOUND=$(grep -r "$BRAND_COLOR" "$APP/packages/shared-ui/" 2>/dev/null | head -1)
if [ -n "$BRAND_FOUND" ]; then
  check "Branding: primary color $BRAND_COLOR found in shared-ui" "ok"
else
  check "Branding: primary color $BRAND_COLOR found in shared-ui" "NOT FOUND — theme not applied"
fi

APP_JSON_NAME=$(grep -o '"name": *"[^"]*"' "$APP/apps/expo-multi-tv/app.json" 2>/dev/null | head -1 | cut -d'"' -f4)
if [ -n "$APP_JSON_NAME" ] && [ "$APP_JSON_NAME" != "react-native-multi-tv-app-sample" ]; then
  check "Branding: app.json name changed to '$APP_JSON_NAME'" "ok"
else
  check "Branding: app.json name changed" "STILL DEFAULT — metadata not updated"
fi

# Phase 4: Manifest wiring
CONTENT_TITLE=$(grep -o '"title": *"[^"]*"' "examples/cooking-shows/content.json" 2>/dev/null | head -1 | cut -d'"' -f4)
CONTENT_FOUND=$(grep -r "$CONTENT_TITLE" "$APP/packages/shared-ui/" 2>/dev/null | head -1)
if [ -n "$CONTENT_FOUND" ]; then
  check "Wiring: content title '$CONTENT_TITLE' found in shared-ui" "ok"
else
  check "Wiring: content title '$CONTENT_TITLE' found in shared-ui" "NOT FOUND — content not injected"
fi

HOOKS_FOUND=$(find "$APP/packages/shared-ui" -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs grep -l "useFeatured\|useVideos\|useCategories" 2>/dev/null | head -1)
if [ -n "$HOOKS_FOUND" ]; then
  check "Wiring: data hooks exist (useFeatured/useVideos/useCategories)" "ok"
else
  check "Wiring: data hooks exist" "NOT FOUND — hooks not created"
fi

# Phase 5: Screen customization
SCREEN_COUNT=$(find "$APP/packages/shared-ui/src/screens" -name "*Screen*" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SCREEN_COUNT" -gt 0 ]; then
  check "Screens: $SCREEN_COUNT screen files found" "ok"
else
  check "Screens: screen files found" "NONE FOUND"
fi

# Phase 6: Navigation
NAV_FILES=$(find "$APP/packages/shared-ui" -name "*.tsx" -o -name "*.ts" 2>/dev/null | xargs grep -l "Screen\|createDrawer\|createStack\|Navigator" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NAV_FILES" -gt 0 ]; then
  check "Navigation: $NAV_FILES files with navigation references" "ok"
else
  check "Navigation: files with navigation references" "NONE FOUND"
fi

# Phase 7: Static checks
if [ -d "$APP" ]; then
  TSC_RESULT=$(cd "$APP" && npx tsc --noEmit 2>&1 | tail -1)
  if [ $? -eq 0 ] || echo "$TSC_RESULT" | grep -q "^$"; then
    check "Static: TypeScript compiles clean" "ok"
  else
    ERROR_COUNT=$(cd "$APP" && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
    check "Static: TypeScript compiles clean" "$ERROR_COUNT errors remaining"
  fi
fi

# Git history (auto-commits)
if [ -d "$APP/.git" ]; then
  COMMIT_COUNT=$(cd "$APP" && git log --oneline 2>/dev/null | wc -l | tr -d ' ')
  check "Git: $COMMIT_COUNT commits in app history" "ok"
else
  check "Git: commit history exists" "NO GIT REPO"
fi

# Report
if [ -f "$OUT/report.md" ]; then
  check "Report: report.md exists" "ok"
else
  check "Report: report.md exists" "MISSING"
fi

echo ""
echo "  ════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
