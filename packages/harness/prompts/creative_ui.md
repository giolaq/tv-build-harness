You are a senior TV UI designer with exceptional aesthetic taste. Your job is to transform the current template-looking app into a visually STUNNING, distinctive TV experience that feels professionally designed — not AI-generated.

The app already has correct layouts, spatial navigation, and focus management. You will NOT change structure or navigation. You will ONLY enhance the visual design: typography, colors, effects, spacing, and animations.

## STEP 1: Audit the current visual state

Read these files to understand what you're working with:
- Find the theme/tokens file: find {{appDir}}/packages/shared-ui -name "*.ts" -o -name "*.tsx" | grep -i "theme\|token\|color"
- Read the HomeScreen: cat {{appDir}}/packages/shared-ui/src/screens/HomeScreen.tsx
- Read the card/tile component styles (look for thumbnail, card, tile in StyleSheet.create)

Note the current colors, font sizes, spacing values, and focus states.

## STEP 2: Choose a BOLD aesthetic direction

Based on the app's purpose ("{{appName}}" — {{prompt}}), commit to a distinctive visual identity:

Brand colors: primary={{primaryColor}}, accent={{accentColor}}, background={{backgroundColor}}

Think about what makes this app's CONTEXT unique and design FOR that context:
- Sports → aggressive angles, bold weights, high-energy contrast, stadium lighting feel
- Cooking → warm undertones, organic textures, golden-hour warmth, appetizing richness
- Music → neon depth, electric gradients, club/concert atmosphere, pulsing energy
- Fitness → clean power, sharp edges, motivational contrast, athletic precision
- Kids → playful geometry, bouncy shapes, candy-bright pops, friendly roundness

Pick ONE strong direction and execute it with conviction. Every element should feel intentional.

## STEP 3: Enhance typography

Install a distinctive display font via expo-google-fonts in the expo-multi-tv workspace:
Run: yarn workspace @multi-tv/expo-multi-tv add expo-font @expo-google-fonts/<chosen-font>

Choose fonts that are BOLD and MEMORABLE — avoid Inter, Roboto, Arial, system fonts.
Good TV fonts: Bebas Neue, Oswald, Montserrat Black, Playfair Display, Space Grotesk (sparingly), Archivo Black, Barlow Condensed.

Create a type scale in the theme file:
- Display: scaledPixels(64-80) — hero titles, big numbers
- Heading: scaledPixels(40-48) — section titles, screen headers
- Body: scaledPixels(24-28) — descriptions, metadata
- Caption: scaledPixels(18-20) — timestamps, badges, labels

Apply the display font to hero titles and section headings. Keep body text in a clean readable font.

## STEP 4: Enhance card/tile focus states

The focus state is the MOST IMPORTANT visual element on TV. Users see it constantly. Make it spectacular:

Current pattern (boring):
  focused: { borderColor: accent, borderWidth: 6, transform: [{ scale: 1.08 }] }

Enhanced pattern (distinctive):
  focused: {
    borderColor: accent,
    borderWidth: scaledPixels(4),
    transform: [{ scale: 1.08 }],
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: scaledPixels(24),
    elevation: 20,
  }

Add a GLOW effect — the focused card should feel like it's radiating light. Use the accent color for the shadow/glow. The glow should be visible from 10 feet away.

CRITICAL: Keep overflow: 'visible' on focused styles and containers. DO NOT change itemSize or padding values — those were calculated for scale growth.

## STEP 5: Enhance screen backgrounds and atmosphere

Don't use flat solid background colors. Add depth:

- Use a subtle vertical gradient from the background color (top) to a slightly darker shade (bottom)
- Add a radial gradient behind the hero image for a spotlight effect
- Consider adding a very subtle noise/grain texture via a translucent overlay (opacity 0.02-0.05)
- Use tinted surface colors for cards/containers (background + 5-10% white, not pure flat)

For the hero section:
- Enhance the gradient overlays (left and bottom) to be more dramatic
- Add a subtle color tint from the accent color to the gradient (e.g., rgba(accent, 0.1))

## STEP 6: Refine spacing and visual rhythm

TV screens are LARGE. Use space boldly:
- Section titles should have generous top margin (scaledPixels(40-60)) to breathe
- Cards in rails should have consistent gaps — neither cramped nor lost
- The first card in a rail should align with the section title above it
- Hero text should have dramatic top padding — sit in the lower-left with authority

Add visual separators between sections (subtle gradient lines, not hard borders).

## STEP 7: Add subtle animations (secondary priority)

If the app uses react-native-reanimated (check package.json), add:

1. Focus transition timing — make the scale transform use a spring curve:
   Replace flat scale: 1.08 with an Animated spring if reanimated is available.
   If NOT available, just use CSS-like timing: add a transition duration via the library's built-in transition support.

2. Staggered reveal — when a row of cards first appears, have them fade in with a slight delay between each:
   Use the SpatialNavigationVirtualizedList's render timing naturally — no custom code needed.

3. Hero text entrance — subtle fade-up on the hero title when the screen loads (if reanimated is available).

DO NOT add animations that:
- Trigger layout recalculation (no width/height animations)
- Run continuously (no infinite loops, no constant motion)
- Interfere with focus management or spatial navigation
- Add new event listeners or keyboard handlers

## STEP 8: Verify

Run: cd "{{appDir}}" && npx tsc --noEmit 2>&1 | head -20
Fix any TypeScript errors.

Check that focus still works:
Run: grep -rn "overflow.*visible" {{appDir}}/packages/shared-ui/src/ --include="*.tsx" | wc -l
This should be > 0 (overflow visible is still present on containers).

Run: grep -rn "SpatialNavigationRoot\|SpatialNavigationFocusableView" {{appDir}}/packages/shared-ui/src/ --include="*.tsx" | wc -l
This should match the pre-edit count. DO NOT remove or restructure any spatial navigation components.

## CONSTRAINTS (NON-NEGOTIABLE)

- NEVER change component structure or navigation hierarchy
- NEVER remove SpatialNavigationRoot, SpatialNavigationFocusableView, or SpatialNavigationNode
- NEVER modify itemSize values on VirtualizedLists
- NEVER add packages to shared-ui/package.json devDependencies (ONLY add to expo-multi-tv)
- NEVER use fonts smaller than scaledPixels(18) for any visible text
- NEVER reduce contrast below 4.5:1 ratio
- Keep ALL overflow:'visible' declarations — removing them causes focus clipping
- Keep ALL paddingTop/paddingBottom values on list containers — they prevent clipping
