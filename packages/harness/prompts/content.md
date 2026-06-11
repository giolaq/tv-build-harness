You MUST wire the content manifest into the existing screens so the app displays THIS content, not the template's default content.

STEP 1: Discover how the template currently loads data.
Run these commands:
- find {{appDir}}/packages/shared-ui -name "*.ts" -o -name "*.tsx" | grep -i -E "(data|content|hook|seed|mock)" | head -20
- grep -r "import.*data" {{appDir}}/packages/shared-ui/src/ --include="*.ts" --include="*.tsx" -l | head -10
- Find where the Home screen gets its video/content data from

STEP 2: Write the content manifest.
Find the existing data directory (might be data/, src/data/, or similar in shared-ui).
If there's an existing content/data/seed JSON file, OVERWRITE it with the manifest below.
If there's no existing data file, create it where the existing imports expect it.

The content manifest to inject:
{{contentManifest}}

STEP 3: Update or create data hooks.
Find the existing hooks that screens use to get content (look for useFeatured, useVideos, useCategories, or similar).
If they exist, modify them to read from your new content file.
If they don't exist, create them AND update the screens to import from them.

Required hooks:
- useFeatured() → returns videos where id is in: {{featuredIds}}
- useCategories() → returns: {{categoryNames}}
- useVideos() → returns all {{videoCount}} videos
- useVideoById(id) → returns single video by id

STEP 4: Wire screens to use YOUR data.
This is the critical step. Find each screen component (Home, Detail, etc.) and ensure it renders YOUR content.
- grep -r "featured\|hero\|banner" {{appDir}}/packages/shared-ui/src/screens/ --include="*.tsx" -l
- Read each screen file. If it imports from a hardcoded source, update the import.
- If screens use sample/placeholder data, replace those references with your hooks.

STEP 5: Update the app title in the drawer/navigation.
Find where the drawer header or app title is set and change it to "{{contentTitle}}".
grep -r "drawerLabel\|headerTitle\|title" {{appDir}}/packages/shared-ui/ --include="*.tsx" --include="*.ts" | head -10

STEP 6: Verify the wiring works.
Run: cd "{{appDir}}" && npx tsc --noEmit 2>&1 | head -30
If there are TypeScript errors, fix them. The app must typecheck.
