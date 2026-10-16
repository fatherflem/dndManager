# Stagehand

Manifest V3 Chrome extension for a tabletop game master. Targets **Foundry VTT v14**, as requested. Plain JavaScript, esbuild, and YAML; speech recognition, speech synthesis, and fetch use browser APIs.

## Version 0.2.0

The command parser, YAML/JSON validation, service worker, Claude client, options page, side panel, isolated bridge, speech controls, and Foundry adapter are implemented. Official **v14.368** API documentation is accessible and verified; see [API_VERIFICATION.md](API_VERIFICATION.md). Mocked tests exercise scenes, playlist/track playback, one-shot broadcast parameters, image sharing, GM-only rolls, GM/version gates, and local music mute/restoration.

**Not yet session-validated.** The public API has no documented remote stop for non-playlist audio or remote image-window closing. Kill audio and Panic stop all playlists and local sounds, and show this limitation in the panel. Remote non-playlist sounds may continue. Use playlist tracks for effects that must be stoppable. Hiding handouts is client-local best effort. No real Forge game, microphone session, or live Claude request has been tested. Cloud Chromium rejects unpacked extension loading under its administrator policy, so live extension testing requires Chrome on your GM machine.

The adapter checks Foundry major version 14, a client-scoped numeric `core.globalPlaylistVolume` setting, and availability of the `selfroll` chat mode at runtime. It fails closed if any safety prerequisite is unavailable. GM playlist volume is muted on activation. Page exit, role loss, or a confirmed extension shutdown restores it; heartbeat delays never restore music. Hidden tabs ignore heartbeat deadlines. Visible tabs reconnect after 45 seconds without a reply, preserving hotkeys and mute. Returning to a visible tab pings/reconnects immediately. The newest Forge page owns Stagehand and older pages become inactive; original volume is retained across handoffs, and an old page cannot restore the new owner’s volume. Verify this behavior on a real browser before relying on it.

## Development

From `stagehand/`, using Node 24:

```sh
npm ci
npm run check
```

`npm test` runs parsing, mocked Claude/Foundry, worker concurrency, log redaction/retention/export, Options/Panel, and page lifecycle tests (including a simulated 60-second hidden interval). `npm run build` bundles scripts and creates `dist/`, including the manifest and static pages. Build again after source changes. Live Foundry testing is separate; passing unit tests does not establish Foundry compatibility.

## Chrome setup

1. Download `Stagehand-extension-0.2.0.zip` from the GitHub release and extract it. Open Chrome's extensions page, enable Developer mode, and load the extracted folder with **Load unpacked**. No Node is needed. Developers can instead build and load `stagehand/dist`. For updates, replace files, reload the extension, and reload every open Foundry tab and Options page.
2. Open Stagehand settings. Upload `examples/cuesheet.example.yaml` or your JSON/YAML cue sheet and a Markdown rules digest. Replace example scene, music and handout references with your own game assets.
3. Enter your Anthropic API key and model. The key stays in Chrome profile-local extension storage and worker requests; it is never sent to the Foundry page. This is local storage, not an encrypted credential vault. The example named-roll bands are intentionally omitted until you supply them.
4. Set recognition language, push-to-talk key (default F13), TTS voice/rate, and matching threshold (default .82). Use the earbud as the GM machine's default audio output.
5. For self-hosted Foundry, add each exact origin and grant permission, then reload the tab. Default host access covers `https://*.forge-vtt.com/*`.
6. Log in as GM on the GM machine and as a player on the TV client. Click the extension action to open the side panel.
7. Hold F13 to speak; releasing processes speech. The backup global shortcut toggles recognition and stops after six seconds of silence. Configure it in Chrome's extension keyboard shortcuts; default Ctrl+Shift+9.

All cues, handouts and named rolls have panel buttons. Tracked state has editable numeric fields. A dice expression field and question field provide typed fallbacks. Cue-defined hotkeys work only in the focused Foundry page and are ignored while typing in an editable field. Manual Foundry instructions can be included in each cue's `manual_fallback` field.

Fixed commands are routed before lookups, including recognition alternatives. Hotkey cues, manual cues, and fixed voice commands run immediately outside the worker configuration queue. Stored view and state updates share one write queue; rapid next/previous commands reserve their navigation positions atomically while the current cue reflects confirmed execution. Claude lookups run separately; a newer lookup aborts the previous request and discards its response. Hold-to-talk uses continuous recognition across pauses and finalizes on key-up. Invalid explicit rolls are rejected. Ambiguous/unmatched cue speech never fires a cue; unmatched speech uses the top recognition alternative for the digest lookup. Lookups require an API key, digest, internet access, and an Anthropic account. Speech recognition uses Chrome's Web Speech service and may require internet access. No credentials are needed for building or unit testing.

## Event log

Open **Panel → Log** for the latest 25 events, newest first. **Copy log** copies the latest 300 entries as JSON; **Download log** exports the full retained ring as `stagehand-log-<date>.json`. **Options → Clear log** clears both buffered and stored entries. Copy/download flush pending entries first.

The worker retains at most 1,000 entries under `chrome.storage.local.log`. Writes are batched every 500 ms or 50 entries, independently of the view/state write queue. Normal cue reads exclude the log. Entries contain an ISO timestamp, source, page session UUID, tab ID, short event name and allowed diagnostic fields. Page reloads generate new session IDs; worker restarts have their own start entry. Transcripts and cue IDs are recorded, so inspect a log before sharing it. API keys, digest fields, request bodies and unknown structured payloads are excluded; known API-key and digest values are also redacted from diagnostic strings.

To reproduce a table issue: keep a GM Forge tab open, switch away for 60 seconds, return, press a cue hotkey within one second, and click **Copy log**. Look for `visibility`, `reconnect`, any `heartbeat-timeout`, `hotkey`, `route`, and `action` entries. If another Forge tab took ownership, look for `tab-takeover`, `deactivate` with `newer-tab`, and dropped messages.

## Packaging and releases

From `stagehand/`, run `npm run package` to build and create `artifacts/Stagehand-extension-0.2.0.zip` (Python 3 is required for packaging). The zip contains only `dist/` contents with `manifest.json` at its root. Pushing the matching `v0.2.0` tag runs `.github/workflows/release.yml`: test, build, package, and attach the prebuilt zip to the GitHub release. Source, lockfile and manifest versions must agree with the tag. Artifacts and dependencies are ignored in Git.

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
- [ ] Switch away for 60 seconds, return and fire a hotkey within one second; GM music stays muted. Copy log and confirm visibility/reconnect/cue events.
- [ ] Open a second Forge tab: it takes ownership, the old tab is inactive, and no GM music is unmuted. Close/reload tabs and verify restoration.
- [ ] Copy and Download log; check 300-entry copy limit, full JSON download, and Options Clear log.
- [ ] Test named rolls, band boundaries, state persistence, next/previous boundaries, voice repeat, and self-host permissions.

No Foundry module is installed. No always-listening mode, scene editing, mobile support, or player-device-specific audio is included.
