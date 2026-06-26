Build the Vega OS variant of the app and verify it bundles successfully.

## Prerequisites Check

1. Check Vega SDK is available:
Run: npx kepler --version 2>&1 | head -3
If "command not found" or fails: report "Vega SDK (Kepler CLI) not installed. Run: npm install -g @amazon-devices/kepler-cli" and STOP.

2. Check the Vega app directory exists:
Run: ls "{{appDir}}/apps/vega/package.json" 2>&1
If not found: report "No apps/vega/ directory in this template. Vega build skipped." and STOP.

## STEP 1: Install Vega dependencies

Run: cd "{{appDir}}/apps/vega" && npm install 2>&1 | tail -10

If install fails with peer dependency errors, try:
Run: cd "{{appDir}}/apps/vega" && npm install --legacy-peer-deps 2>&1 | tail -10

## STEP 2: Validate the Vega manifest

Check that the manifest exists and has required fields:
Run: cat "{{appDir}}/apps/vega/manifest.toml" 2>/dev/null || cat "{{appDir}}/apps/vega/vega.json" 2>/dev/null

Verify:
- App name matches the brand (should be "{{appName}}")
- Entry point is correctly set
- Required capabilities are declared (at minimum: network access)

If the manifest is missing or malformed, create/fix it using the loaded skill's manifest patterns.

## STEP 3: Build the Vega bundle

Run: cd "{{appDir}}/apps/vega" && npx kepler build 2>&1 | tail -30

If the build fails:
1. Read the full error output
2. Common fixes:
   - "Module not found: @amazon-devices/*" in a shared file: the import needs a `.kepler.ts` override file
   - "Cannot resolve 'react-native-video'": create a `.kepler.ts` override using `@amazon-devices/kepler-media`
   - "Cannot resolve 'expo-font'": fonts on Vega are declared in the manifest, not loaded at runtime. Remove the import or stub it.
   - TypeScript errors: fix the type issue in the source
3. Fix the issue
4. Re-run the build

Maximum 3 build attempts. If still failing after 3 tries, report the error and stop.

## STEP 4: Verify build output

Run: ls "{{appDir}}/apps/vega/dist/" 2>/dev/null || ls "{{appDir}}/apps/vega/build/" 2>/dev/null

PASS if: a bundle file exists (`.js` or `.bundle` in the output directory)
FAIL if: no output directory or empty

## STEP 5: Report

Output:
```
## Vega Build Results
- Status: PASS / FAIL
- Build attempts: <N>
- Bundle location: <path>
- Issues fixed: <list or "none">
- Issues remaining: <list or "none">
```
