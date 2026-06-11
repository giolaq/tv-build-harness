You MUST customize the app's identity and visual theme. The app currently looks like the generic template — your job is to make it look like "{{appName}}".

STEP 1: Read the existing files to understand their current structure.
Run these reads first:
- Read {{appDir}}/apps/expo-multi-tv/app.json
- Find the theme tokens file: look in {{appDir}}/packages/shared-ui/ for files containing color definitions (likely in theme/, src/theme/, or similar — use find to locate files with "background" or "primary" color values)

STEP 2: Update app metadata.
Edit {{appDir}}/apps/expo-multi-tv/app.json:
- Set "name" to "{{appName}}"
- Set "slug" to "{{slug}}"
- Set the iOS bundleIdentifier to "{{bundleId}}"
- Set the Android package to "{{bundleId}}"
- Set the display name / app name wherever it appears

STEP 3: Replace ALL color values in the theme tokens file.
Find the theme tokens file (search for it — it may be tokens.ts, theme.ts, colors.ts, or similar inside packages/shared-ui/).
Replace the color values with these EXACT values:
- primary/brand color → {{primaryColor}}
- accent/highlight color → {{accentColor}}
- background color → {{backgroundColor}}
- surface color → derive from background (slightly lighter): adjust background +10% lightness
- text color → #FFFFFF (dark theme)
- muted text → #A0A0A8

Do NOT just create new files. You MUST edit the existing theme files in-place so all existing components pick up the new colors automatically.

STEP 4: Update font if specified.
Font family to use: {{fontFamily}}

STEP 5: Verify your changes.
Run: cd "{{appDir}}" && grep -r "{{primaryColor}}" packages/shared-ui/ | head -5
This should show your color appearing in the theme files. If it shows nothing, your edits didn't work — try again.
