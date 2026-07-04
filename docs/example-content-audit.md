# Example Content Audit

T10.4 audit, July 2026.

| Path | Finding | Action |
| --- | --- | --- |
| `examples/nintendo-games/content.json` | Contained real game titles, descriptions, and owner-hosted artwork. | Replaced with synthetic catalog and placeholder artwork. |
| `examples/nintendo-games/fetch-content.js` | Fetches third-party catalog data for local experimentation. | Changed output to ignored `content.fetched.json`; added local-use README. |
| `examples/nintendo-games/brand.json` and `prompt.txt` | Referenced a real platform owner identity. | Replaced with synthetic Arcade Showcase identity. |
| `examples/sports-live/content.json` | Contained real leagues, events, and competition names. | Replaced with synthetic leagues and events. |
| `examples/changelog-site/content.json` | Used non-checkable `example.com` media URLs. | Replaced with stable placeholder images and test streams. |
| `docs/course/demos/agent-drives-harness/input/content.json` | Used non-checkable `example.com` stream URLs. | Replaced with test streams. |
| Other `examples/*/content.json` | Synthetic food, fitness, music, or release-note metadata; no owner-hosted media. | No content rewrite needed. |

Guardrails:

- `scripts/check-example-links.ts --domains-only` runs in normal CI.
- `.github/workflows/example-hygiene.yml` runs the full URL check weekly and on demand.
- `.github/pull_request_template.md` requires example/fixture content review.
