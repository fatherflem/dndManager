Stagehand 0.2.0 adds an event log and fixes recovery after switching browser tabs.

Download **Stagehand-extension-0.2.0.zip** below, extract it, and load the extracted folder in Chrome's Extensions page using **Developer mode → Load unpacked**. No Node installation is needed. To update an existing unpacked installation, replace its files, click Reload on the extension, and reload every open Foundry tab and the Options page.

- **Panel → Log → Copy log** copies the latest 300 events as JSON; **Download log** exports up to 1,000. **Options → Clear log** clears it.
- Logs include page sessions, visibility and focus, hotkeys, speech, routing scores, connection ownership, and action outcomes and timing. Keys, digest text and Claude request bodies are excluded and known secret values are redacted. Transcripts and cue identifiers are included.
- Hidden tabs do not deactivate on a missed heartbeat. Visible tabs use a 45-second window and reconnect without unmuting GM music or dropping bound hotkeys.
- The newest Forge tab owns Stagehand; older tabs go inactive. Volume restoration respects the current owner.
- Options opened in a Chrome tab can load and save settings, and empty settings responses display an error.
- Serialized view/state writes and rapid scene-navigation safeguards are retained from the repository.

Automated tests simulate hiding a tab for 60 seconds, returning, and firing a cue within 500 ms without unmuting. The same check on a live Forge game remains required; this release has not been live-session validated. Public Foundry API limitations for remote non-playlist audio stopping and remote handout closing remain unchanged.
