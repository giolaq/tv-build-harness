Transform the app's visual identity from generic template to distinctive brand. The app must look unmistakably like "{{appName}}", not a template.

## STEP 1: Discover the existing theme structure

Use the loaded skill to find where these live in this project:
- App metadata / config file (name, bundle ID, slug)
- Theme tokens (colors, typography)

Read those files before making any changes.

## STEP 2: Update app metadata

Set the app name to "{{appName}}", slug to "{{slug}}", and bundle identifier to "{{bundleId}}" in the app config file. Use the loaded skill to find the right file.

## STEP 3: Build a complete color system

Brand inputs: primary={{primaryColor}}, accent={{accentColor}}, background={{backgroundColor}}

Derive a full palette:
- `background`: {{backgroundColor}}
- `surface`: background + 8% lightness (for cards and containers)
- `surfaceElevated`: background + 12% lightness (for focused elements)
- `primary`: {{primaryColor}}
- `secondary`: {{accentColor}}
- `text`: #FFFFFF or #F5F5F5
- `textSecondary`: 70% opacity white
- `textOnPrimary`: high-contrast text on primary
- `border`: 15% opacity white
- `card`: surface color (distinct from background)
- `cardElevated`: surfaceElevated color

Replace ALL color values in the theme file. Do NOT leave template defaults. `background`, `surface`, and `card` must all be different shades.

## STEP 4: Set typography

Font family: {{fontFamily}}

Update the typography configuration to use {{fontFamily}} for display/heading (bold weight). Use the loaded skill to find the right file and format.

If the font needs to be installed, note it for the creative_ui phase.

## STEP 5: Verify

Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1 | head -20
Fix any errors.

Verify that primary and accent colors appear in the theme file and that background, surface, and card are distinct values.
