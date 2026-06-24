Wire the content manifest into the project so the app displays this content, not the template's default content.

STEP 1: Discover how the template loads data.
Use the loaded skill to understand where content data lives and how screens consume it. Look for data files, hooks, and seed/mock content.

STEP 2: Write the content manifest.
Find the existing data file or directory (the loaded skill knows where to look).
If an existing content/data file exists, OVERWRITE it with the manifest below.
If none exists, create it where the existing imports expect it.

The content manifest to inject:
{{contentManifest}}

STEP 3: Update or create data hooks.
Find the hooks that screens use to get content. Modify them to read from your new content file.
If they don't exist, create them and update the screens to import from them.

Required hooks:
- useFeatured() → returns videos where id is in: {{featuredIds}}
- useCategories() → returns: {{categoryNames}}
- useVideos() → returns all {{videoCount}} videos
- useVideoById(id) → returns single video by id

STEP 4: Wire screens to use your data.
Find each screen component and ensure it renders your content, not placeholder or template data.

STEP 5: Update the app title in navigation.
Find where the navigation header or drawer title is set and change it to "{{contentTitle}}".

STEP 6: Verify.
Run: cd "{{appDir}}" && {{typeCheckCommand}} 2>&1 | head -30
Fix any errors. The app must type-check.
