# Stagehand

Manifest V3 Chrome extension for a tabletop game master. Targets **Foundry VTT v14**, as requested. Plain JavaScript, esbuild, and YAML; speech recognition, speech synthesis, and fetch use browser APIs.

## Current implementation status

The command parser, YAML/JSON validation, service worker, Claude client, options page, side panel, isolated bridge, speech controls, and Foundry adapter are implemented. Official **v14.368** API documentation is accessible and verified; see [API_VERIFICATION.md](API_VERIFICATION.md). Mocked tests exercise scenes, playlist/track playback, one-shot broadcast parameters, image sharing, GM-only rolls, GM/version gates, and local music mute/restoration.

**Not yet session-validated.** The public API has no documented remote stop for non-playlist audio or remote image-window closing. Kill audio and Panic stop all playlists and local sounds, and show this limitation in the panel. Remote non-playlist sounds may continue. Use playlist tracks for effects that must be stoppable. Hiding handouts is client-local best effort. No real Forge game, microphone session, or live Claude request has been tested. Cloud Chromium rejects unpacked extension loading under its administrator policy, so live extension testing requires Chrome on your GM machine.

The adapter checks Foundry major version 14, a client-scoped numeric `core.globalPlaylistVolume` setting, and availability of the `selfroll` chat mode at runtime. It fails closed if any safety prerequisite is unavailable. GM playlist volume is muted on activation and restored on page exit, role loss, or extension connection loss (detected by heartbeat within roughly 12 seconds). Verify restoration on a real browser before relying on it.

## Development

From `stagehand/`, using Node 24:

```sh
npm ci
npm run check
```

`npm test` runs 31 pure, mocked Claude HTTP, and mocked Foundry adapter tests. `npm run build` bundles scripts and creates `dist/`, including the manifest and static pages. Build again after source changes. Live Foundry testing is separate; passing unit tests does not establish Foundry compatibility.

## Chrome setup

1. Open Chrome's extensions page, enable Developer mode, and load unpacked `stagehand/dist`.
2. Open Stagehand settings. Upload `examples/cuesheet.example.yaml` or your JSON/YAML cue sheet and a Markdown rules digest. Replace example scene, music and handout references with your own game assets.
3. Enter your Anthropic API key and model. The key stays in Chrome profile-local extension storage and worker requests; it is never sent to the Foundry page. This is local storage, not an encrypted credential vault. The example named-roll bands are intentionally omitted until you supply them.
4. Set recognition language, push-to-talk key (default F13), TTS voice/rate, and matching threshold (default .82). Use the earbud as the GM machine's default audio output.
5. For self-hosted Foundry, add each exact origin and grant permission, then reload the tab. Default host access covers `https://*.forge-vtt.com/*`.
6. Log in as GM on the GM machine and as a player on the TV client. Click the extension action to open the side panel.
7. Hold F13 to speak; releasing processes speech. The backup global shortcut toggles recognition and stops after six seconds of silence. Configure it in Chrome's extension keyboard shortcuts; default Ctrl+Shift+9.

All cues, handouts and named rolls have panel buttons. Tracked state has editable numeric fields. A dice expression field and question field provide typed fallbacks. Cue-defined hotkeys work only in the focused Foundry page and are ignored while typing in an editable field. Manual Foundry instructions can be included in each cue's `manual_fallback` field.

Fixed commands are routed before lookups, including recognition alternatives. Invalid explicit rolls are rejected. Ambiguous/unmatched cue speech never fires a cue; unmatched speech uses the top recognition alternative for the digest lookup. Lookups require an API key, digest, internet access, and an Anthropic account. Speech recognition uses Chrome's Web Speech service and may require internet access. No credentials are needed for building or unit testing.

## Real Forge acceptance checklist — NOT RUN

- [ ] Hold the key and say “next scene”: TV switches scene and starts its linked music in under 1.5 seconds.
- [ ] “kill audio”: every playing playlist stops on TV. **Known public-API limitation:** remote non-playlist sounds may continue; full spec acceptance remains unmet.
- [ ] “roll a d100”: earbud speaks total; GM-only chat has the roll; players see nothing.
- [ ] “show harding”: TV displays image. Hide is client-local best effort; no documented remote-close API exists.
- [ ] Digest question: one or two spoken sentences within four seconds; panel preserves section citation.
- [ ] GM music is muted while Stagehand is active and restored when disabled.
- [ ] Every cue hotkey and panel button works with microphone unplugged.
- [ ] Panic stops audio and activates Black.
- [ ] Disconnect internet: failures are clear and Foundry does not hang.
- [ ] Player login stays inert; no microphone, actions, or GM volume changes.
- [ ] Test named rolls, band boundaries, state persistence, next/previous boundaries, voice repeat, and self-host permissions.

No Foundry module is installed. No always-listening mode, scene editing, mobile support, or player-device-specific audio is included.
