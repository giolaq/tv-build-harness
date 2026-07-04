---
name: changelog-static-site
applies_to: [clone-template, inject-content, brand, verify-site]
---

# Changelog Static Site

Use this skill when generating a non-TV static changelog/docs site from the harness.

## Content Mapping

The current input schema is the standard harness `content.json`. For this example, interpret `content.videos` as release entries:

- `id` becomes the release slug.
- `title` becomes the visible release heading.
- `description` becomes the release summary.
- `tags` become category badges.
- `featured` marks the latest or highlighted release.

Do not render media players, thumbnails, durations, or streaming controls.

## Site Shape

Create a small documentation site with:

- Home page with the latest release and short product context.
- Releases page with every release in reverse chronological order.
- About page explaining the changelog.
- Shared navigation and footer.

## Build Contract

The generated app must include `package.json` and a local `npm run build` command. A zero-dependency build script is acceptable. For example, a Node script that verifies required HTML files exist is enough for this teaching example.

## Gotchas

- Do not import React Native, Expo, TV navigation, or video libraries.
- Do not require network access during `npm run build`.
- Keep generated paths relative so the static site can be opened from disk.
