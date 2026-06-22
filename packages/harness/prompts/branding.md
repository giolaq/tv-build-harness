You MUST transform the app's visual identity from generic template to distinctive brand. The app currently looks identical to every other app built from this template — your job is to make it unmistakably "{{appName}}".

## STEP 1: Read existing theme structure

Run these reads first:
- Read {{appDir}}/apps/expo-multi-tv/app.json
- Find the theme tokens file: look in {{appDir}}/packages/shared-ui/ for files containing color definitions (likely in theme/, src/theme/, or similar)
- Read the colors.ts and typography.ts (or equivalent)

## STEP 2: Update app metadata

Edit {{appDir}}/apps/expo-multi-tv/app.json:
- Set "name" to "{{appName}}"
- Set "slug" to "{{slug}}"
- Set the iOS bundleIdentifier to "{{bundleId}}"
- Set the Android package to "{{bundleId}}"

## STEP 3: Build a COMPLETE color system (not just primary swap)

Brand inputs: primary={{primaryColor}}, accent={{accentColor}}, background={{backgroundColor}}

Derive a full palette from these inputs:
- `background`: {{backgroundColor}} (the deepest layer)
- `surface`: background + 8% lightness (for cards and containers)
- `surfaceElevated`: background + 12% lightness (for focused/elevated elements)
- `primary`: {{primaryColor}} (key CTAs, active indicators)
- `secondary`: {{accentColor}} (focus glow, highlights, accent elements)
- `text`: #FFFFFF or #F5F5F5 (primary text on dark)
- `textSecondary`: 70% opacity white (metadata, descriptions)
- `textOnPrimary`: high-contrast text on the primary color
- `border`: 15% opacity white (subtle card edges)
- `card`: surface color (distinct from background — NOT the same)
- `cardElevated`: surfaceElevated color

Replace ALL color values in the theme file with these derived values. Do NOT leave template defaults.

## STEP 4: Set typography personality

Font family: {{fontFamily}}

Update the typography configuration:
- Set the display/heading fontFamily to {{fontFamily}} (bold/heavy weight variant)
- Keep body text in a clean readable font (the template default is fine for body)
- Ensure font weights are available: the display font needs 700 or 800 weight

If the font is not already installed, note it for the creative_ui phase to handle (it will install via expo-google-fonts).

## STEP 5: Verify the transformation

Run: cd "{{appDir}}" && grep -r "{{primaryColor}}" packages/shared-ui/ | head -5
This should show your primary color in the theme files.

Run: cd "{{appDir}}" && grep -r "{{accentColor}}" packages/shared-ui/ | head -5
This should show your accent color.

Run: cd "{{appDir}}" && grep -rn "background\|surface\|card" packages/shared-ui/src/theme/colors.ts | head -10
Verify that background ≠ surface ≠ card (they must be different shades for depth).

If any check shows nothing, your edits didn't work — find the right file and try again.
