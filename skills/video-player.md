---
name: video-player
applies_to: [phase_screens, phase_manifest]
load_when: customizing the player, adding new stream types, debugging playback
---

# Video player

> The template uses `react-native-video` on Expo platforms and `@amazon-devices/kepler-media` on Vega. Both are wrapped by the shared `<Player>` component. Most player work is about getting stream URLs and metadata right, not about touching the player guts.

## Supported stream types in the template

| `stream_type` | Player support | Notes |
|---------------|----------------|-------|
| `hls` (`.m3u8`) | All platforms | Default for live + adaptive VOD. Best choice. |
| `dash` (`.mpd`) | Android TV, Fire TV (both), Web | Apple TV's support is partial. Prefer HLS on Apple TV. |
| `mp4` | All platforms | Single bitrate, large file. Fine for short clips, bad for full episodes. |

If the manifest mixes types: that's fine. The player reads `stream_type` and configures itself.

## Apple TV note: HLS-only in practice

Apple TV's media pipeline expects HLS for live and most VOD. DASH works in some cases but has higher failure rates. **For any Apple TV target, prefer HLS streams.** If the source is DASH-only, the harness should flag it; it's still buildable but expect playback issues.

## Vega note: use the override, not direct deps

The shared `<Player>` has a `.kepler.ts` override that swaps `react-native-video` for `@amazon-devices/kepler-media`. **Don't** import `react-native-video` directly in a Vega screen — it will silently fail at runtime. Always use `<Player>` from `packages/shared-ui`.

## DRM — current state and upgrade path

v1 of the harness does **not** support DRM. The template's player is configured for clear streams only. If the manifest indicates DRM is needed:

- For HLS: FairPlay (Apple TV), Widevine (Android TV, Fire TV FOS, Web), PlayReady (some Vega cases).
- For DASH: Widevine.

Adding DRM requires:
1. License server URL per scheme.
2. Certificate file (FairPlay).
3. Per-platform config in `react-native-video` and `kepler-media`.
4. Token-based or anonymous license acquisition.

This is multi-day work. If the user needs DRM, escalate — don't fake it.

## Player overlay controls

The template ships overlay controls with:
- Play / pause
- Seek bar with scrubbing
- Time remaining
- Title and metadata
- Back / close button

D-pad bindings (already wired):
- **Select** while playing → toggle play/pause
- **Left / Right** → seek -10s / +10s
- **Up** → show controls if hidden
- **Down / Menu / Back** → return to detail

Don't rebind these. Users expect them.

### Customizing the overlay

The overlay is in `packages/shared-ui/components/Player/Controls/`. Reasonable customizations:

- Brand color on the scrub bar (already pulled from theme tokens).
- Logo on the controls bar.
- Title typography.

Avoid:
- Replacing the scrub bar with a custom slider. Focus and scrubbing are coupled in non-obvious ways.
- Auto-hiding controls aggressively (< 3 seconds idle). Users miss them.

## Buffering, errors, and resilience

The player must handle these gracefully. The template does:

- **Buffering** → semi-transparent spinner overlay. Don't block input; allow back to detail.
- **Error** (`onError`) → toast with error code, auto-return to detail after 5s, log to `RunLog`.
- **End** (`onEnd`) → either auto-play next (if `useRelated()` returns items) or return to detail.

When a stream URL is dead, the user lands back on detail with a non-mysterious error. Black screen forever is the worst outcome.

## Audio and subtitles

- HLS streams often carry multiple audio tracks and CC. `react-native-video` exposes them via `selectedAudioTrack` and `selectedTextTrack`.
- The template's `<Player>` has hooks but doesn't ship a UI for switching. If the user's content needs CC (most accessibility-conscious apps do), add a controls-overlay menu.
- Defaults: pick the audio track matching device language; pick CC if device has "always on subtitles" accessibility setting; otherwise off.

## Playback metrics (out of v1 scope, but design for it)

Most production apps want:
- Time-to-first-frame
- Rebuffer ratio
- Bitrate over time
- Error events

The player exposes `onProgress`, `onBuffer`, `onBandwidthUpdate`, `onError`. The harness doesn't need to wire telemetry in v1, but it should leave the hooks in place so adding analytics later is trivial.

## Common playback failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| Black screen, no error | Stream URL is HTTP, not HTTPS, and ATS / network security blocks it | Use HTTPS, or add per-domain ATS exception (Apple TV) / network security config (Android) |
| Plays on Web, not on Apple TV | DASH on Apple TV | Re-encode as HLS |
| Stutters on Fire TV (Fire OS only) | Bitrate too high for the device | Provide an HLS manifest with lower-bitrate variants |
| Crash on launch when player screen mounts | Source URL is `undefined` (manifest validation missed it) | Add the validation in `manifest-wiring.md` |
| Audio plays, no video | Codec unsupported on platform (e.g. HEVC on older Fire TVs) | Provide H.264 variant in HLS manifest |
| CC missing | Track not in HLS manifest, or wrong language code | Verify with `ffprobe` or HLS analyzer |

## Decision tree: "the player isn't working"

1. Does the stream URL play in VLC on your machine? If no → it's the source, not the app.
2. Is the URL HTTPS? Mixed-content blocks are a top cause on Apple TV / iOS-derived platforms.
3. Is `stream_type` correct? `hls` for `.m3u8`, `dash` for `.mpd`, `mp4` for direct files.
4. Are you running on Vega and seeing black? Confirm `<Player>` is the shared-ui import, not `react-native-video` directly.
5. Does it play on one platform but not another? Likely a codec issue; check HLS variants.
6. Errors logged to console? `onError` has a code; look it up against `react-native-video` docs or Kepler media docs.

## Anti-patterns

- **Building a custom player from `<Video>` on a new screen.** Use shared `<Player>` even if it means lifting controls behavior.
- **Importing `react-native-video` in a `.tsx` file (no platform extension).** That file resolves on Vega and breaks. Use `<Player>` or split with `.kepler.ts`.
- **Hardcoding bitrate or codec selection.** Let the adaptive stream pick.
- **Showing a generic "Error" message to users.** At least show "Couldn't play. Try again or pick another." with a back button.
