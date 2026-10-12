# Foundry API verification

Official reference retrieved on 2026-10-12: **Foundry v14.368 Stable**. Adapter accepts major version 14 only and checks GM status for every action. Documentation verification and mocked tests are complete; live game verification is outstanding.

| Capability | Verified reference / v14 call |
| --- | --- |
| Scene lookup | [DocumentCollection](https://foundryvtt.com/api/v14/classes/foundry.documents.abstract.DocumentCollection.html): `get(id)`, `getName(name)` |
| Scene activation | [Scene](https://foundryvtt.com/api/v14/classes/foundry.documents.Scene.html#activate): `await scene.activate()`; skip if already active |
| Playlist/track/stop | [Playlist](https://foundryvtt.com/api/v14/classes/foundry.documents.Playlist.html): `playAll()`, `playSound(sound)`, `stopAll()` |
| Playing playlists | [Playlists](https://foundryvtt.com/api/v14/classes/foundry.documents.collections.Playlists.html#playing): `playing` returns an array |
| One-shot broadcast | [AudioHelper static play](https://foundryvtt.com/api/v14/classes/foundry.audio.AudioHelper.html#play-2): object plus boolean broadcast flag; explicitly use `autoplay:true`, `loop:false`, `channel:'music'` to route through GM-muted music |
| Local sound stopping | [AudioHelper](https://foundryvtt.com/api/v14/classes/foundry.audio.AudioHelper.html#playing) `game.audio.playing` is a Map of [Sound](https://foundryvtt.com/api/v14/classes/foundry.audio.Sound.html#stop) instances with async `stop()` |
| Image sharing | [ImagePopout](https://foundryvtt.com/api/v14/classes/foundry.applications.apps.ImagePopout.html): v14 constructor takes **one options object**, `{src, window:{title}}`, followed by `shareImage({image, title, showTitle:true})`; old `(src, options)` signature is not used |
| Image closing | `ImagePopout.close()` is client-local. No public remote-close API was found; hide remains best effort |
| Client-local volume | [AudioHelper.registerSettings](https://foundryvtt.com/api/v14/classes/foundry.audio.AudioHelper.html#registersettings) registers client volume controls; [globalVolumeChanged](https://foundryvtt.com/api/v14/functions/hookEvents.globalVolumeChanged.html) documents `globalPlaylistVolumeChanged`. [ClientSettings](https://foundryvtt.com/api/v14/classes/foundry.helpers.ClientSettings.html) exposes `settings`, `get`, `set`. The registry must contain `core.globalPlaylistVolume` with `scope:'client'` and a numeric value before activation; otherwise fail closed. Exact key registration is checked at runtime because the API docs do not enumerate registration values |
| Roll | [Roll](https://foundryvtt.com/api/v14/classes/foundry.dice.Roll.html): `validate(formula)`, `await new Roll(formula).evaluate({allowInteractive:false})`, `toMessage(data,{messageMode:'selfroll'})`. **v14 documents messageMode, not rollMode.** [CONFIG.ChatMessage.modes](https://foundryvtt.com/api/v14/variables/CONFIG.ChatMessage.html#modes) is checked for `selfroll` at runtime; explicit `whisper:[game.user.id]` prevents sharing with other GMs or players |

## Remaining limits

`AudioHelper` documents broadcast **play**, but no broadcast **stop**. Playlist stops propagate through Playlist documents; local Sound stops affect only the GM browser. Remote one-shots and ambient audio cannot be guaranteed to stop through the verified public API. The panel reports this limit for Kill audio and Panic. This prevents claiming the spec's “stop every playing sound on the TV” acceptance test passes. Use playlist tracks for music and effects that must be stoppable until a supported remote-stop route is established.

No private socket event names were invented, and no module is installed on Forge. Remote handout closing is likewise not guaranteed. GM music-channel muting, volume restoration on page exit/extension disconnection, selfroll privacy, image delivery, speech latency and broadcast playback all require the real Forge checklist.
