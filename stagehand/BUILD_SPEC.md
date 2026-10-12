# Stagehand — Build Spec for Codex

*A Chrome extension that lets a tabletop game master drive Foundry VTT by voice and hotkeys: switch scenes, play music, show handouts, roll dice, and ask rules questions answered into an earbud. Written for an AI coding agent. Build exactly this; ask before adding scope.*

---

## 0. Context in one paragraph

The game master (GM) runs an in-person tabletop game. Foundry VTT is hosted on The Forge (a cloud host). The GM's own computer runs Chrome with the Foundry game open, logged in as the GM. A Chromebook plugged into a TV is logged in as a player and shows whatever scene the GM activates, playing the music. The GM wears one earbud and a close mic. The GM holds a push-to-talk key, says a command, and the extension does it. Players never see or hear the extension. Only the GM's machine has it installed.

## 1. Hard requirements

1. **Manifest V3** Chrome extension. No Foundry module; nothing is installed on the Forge.
2. **Runs only on the GM's Foundry tab.** Host match patterns: `https://*.forge-vtt.com/*` by default, plus user-configurable extra origins (for a self-hosted Foundry).
3. **Activates only if the logged-in Foundry user is a GM** (`game.user.isGM`). Otherwise it does nothing.
4. **Speech recognition is Chrome's built-in Web Speech API** (`webkitSpeechRecognition`). No other speech-to-text service.
5. **Push-to-talk only.** It never listens unless the push-to-talk key is active.
6. **Fixed commands and dice never call an AI.** Only unmatched speech goes to the Claude API.
7. **Spoken output goes to the GM only**, through `speechSynthesis` on the GM machine. The GM sets the earbud as the machine's default audio output. The extension also forces the GM client's Foundry playlist volume to 0, so music plays on the TV client, not in the earbud.
8. **Every action has a manual fallback**, shown in the cue sheet and the side panel. Nothing the GM needs depends on voice working.

## 2. Architecture

```
┌──────────────────────── Chrome (GM machine) ────────────────────────┐
│                                                                     │
│  Foundry tab (Forge)                                                │
│  ┌──────────────────────────┐   window.postMessage   ┌───────────┐  │
│  │ main-world script         │◄─────────────────────►│ isolated  │  │
│  │  - push-to-talk keys      │                        │ content   │  │
│  │  - webkitSpeechRecognition│                        │ script    │  │
│  │  - speechSynthesis (TTS)  │                        │ (bridge)  │  │
│  │  - Foundry API calls      │                        └─────┬─────┘  │
│  │    (game.scenes, Roll…)   │                              │        │
│  └──────────────────────────┘                  chrome.runtime        │
│                                                              │        │
│  ┌────────────────────┐        ┌────────────────────────────▼──────┐ │
│  │ Side panel (UI)    │◄──────►│ Service worker                     │ │
│  │ heard / did / state│        │  - command router & parsers        │ │
│  │ next cues, buttons │        │  - cue sheet + state (storage)     │ │
│  └────────────────────┘        │  - Claude API calls (holds the key)│ │
│                                └────────────────────────────────────┘ │
│  Options page: cue sheet upload, rules digest upload, API key,        │
│  voice, hotkeys, thresholds                                           │
└─────────────────────────────────────────────────────────────────────┘
```

- **Main-world script** (`content_scripts` with `"world": "MAIN"`): the only code that can touch Foundry's global `game` object. It owns the mic, speech recognition, text-to-speech and the Foundry calls. It holds **no secrets**.
- **Isolated content script:** a thin bridge. It relays messages between the page (`window.postMessage`, with a fixed message tag and origin check) and the service worker (`chrome.runtime`).
- **Service worker:** parses transcripts, routes commands, stores the cue sheet and state, and makes Claude API calls. **The API key never enters the page.**
- **Side panel** (`chrome.sidePanel`): the GM's live view.
- **Options page:** setup.

Keep parsing logic (normalizing, alias matching, dice parsing, the command grammar) in **pure modules with no browser or Foundry dependencies**, so they are unit-testable.

## 3. Push-to-talk

Support two triggers. Either one is enough to run a session.

1. **Hold-to-talk key (primary).** A configurable key (default `F13`, which a Stream Deck or foot pedal can send) handled with `keydown`/`keyup` in the page. Key down starts recognition and plays a short soft tick in the earbud. Key up stops recognition and processes the transcript. Ignore key repeat. The Foundry tab must be focused.
2. **Global toggle (backup).** A `chrome.commands` shortcut marked `"global": true` (Chrome limits global shortcuts to `Ctrl+Shift+0–9`). Commands fire on press only, so this one is a **toggle**: press to start, press again or 6 seconds of silence to stop.

Recognition settings: `lang` from options (default `en-US`), `interimResults: true` (show live text in the panel), `maxAlternatives: 5`, `continuous: false` for hold-to-talk. On `onerror` (`no-speech`, `network`, `not-allowed`), speak a short error ("Didn't catch that," "Mic blocked") and log it in the panel.

## 4. Command routing

Process the **top recognition result first, then each alternative**. The first alternative that matches a fixed command wins. If none match, send the top result to the Claude lookup.

### 4.1 Normalize
- lowercase, strip punctuation, collapse spaces
- number words to digits ("one hundred" → 100, "twenty" → 20, "two" → 2)
- dice speech to dice: "d twenty", "dee twenty", "D-20", "d 20" → `d20`; "two d six" → `2d6`; "a d100" → `1d100`
- "plus" / "minus" → `+` / `-`

### 4.2 Grammar (v1)

| Pattern | Action |
|---|---|
| `next scene` / `previous scene` | Activate the next / previous cue in cue-sheet order |
| `scene <alias>` (or just `<alias>` if it uniquely matches a scene cue) | Activate that cue |
| `music <alias>` | Play that track or playlist |
| `kill audio` / `stop music` / `silence` | Stop every playing playlist and sound |
| `show <alias>` | Show that handout image to all players |
| `hide handout` | Close shared image popouts (best effort) |
| `roll <dice expression>` | Dice roll (§6) |
| `roll <named roll>` | Named roll (§6.2) |
| `set <state name> <number>` | Update tracked state (§6.3) |
| `panic` | Stop all audio and activate the black scene |
| `repeat` | Speak the last response again |
| anything else | Claude lookup (§7) |

### 4.3 Alias matching
- Every cue has a list of aliases. Match with a token-based fuzzy score (for example, token-set ratio on normalized strings).
- Accept a match only at or above a threshold (default 0.82, configurable) **and** at least 0.08 above the second-best cue. Otherwise treat it as unmatched.
- **An unmatched phrase must never fire a cue.** It goes to the lookup, and the panel shows "no cue matched."

## 5. Foundry actions

Target the Foundry version the Forge game runs. **Pin and verify every call below against that version's API docs before relying on it.** Wrap each call in a small adapter (`foundryAdapter.js`) so version differences live in one file.

| Action | Expected API (verify) |
|---|---|
| Find a scene | `game.scenes.getName(name)` or `game.scenes.get(id)` |
| Show a scene to everyone | `scene.activate()` (this also starts the scene's linked playlist or sound, if set) |
| Play a playlist | `game.playlists.getName(name).playAll()` |
| Play one track | `playlist.playSound(sound)` (find the sound by name in `playlist.sounds`) |
| Stop everything | `game.playlists.playing` → `stopAll()` on each |
| One-shot sound to everyone | `AudioHelper.play({ src, volume, loop: false }, true)` (namespace may be `foundry.audio.AudioHelper` in newer versions) |
| Show an image to players | `new ImagePopout(src, { title }).shareImage()` (verify name and signature) |
| GM's own music volume to 0 | `game.settings.set("core", "globalPlaylistVolume", 0)` on activation, restore on disable (verify key) |
| Whispered roll | see §6 |

Rules:
- Activating a scene that is already active does nothing and says "Already there."
- Every action speaks a two-to-four word confirmation ("Bathhouse." "Audio killed." "Rolled 73.") and logs to the panel.
- Failures speak "Couldn't do that" and log the exception. Never throw into Foundry.

## 6. Dice

### 6.1 Expressions
- Accept standard Foundry formulas built from the normalized speech: `1d100`, `3d6+2`, `2d8-1`, `4d6kh3` ("four d six keep highest three"), `1d20` with "advantage" → `2d20kh`, "disadvantage" → `2d20kl`.
- Roll with Foundry's `Roll` class: `const roll = await new Roll(formula).evaluate();`
- Post it to chat **visible to the GM only** (`roll.toMessage({ flavor: "Stagehand" }, { rollMode: "selfroll" })`, verify the roll mode constant), then speak the total: "d100: seventy-three."
- Reject anything that doesn't parse, and speak "Not a roll."

### 6.2 Named rolls
Defined in the cue sheet (§8) as a formula over tracked state. Example for this game:

```yaml
named_rolls:
  - id: avatar_condition
    voice: ["avatar condition", "the condition roll", "avatar roll"]
    formula: "1d100 + @integrity_lost * @il_multiplier + @war_within * 10 + (@castor_turned * 10)"
    speak: "Condition {total}. Band {band}."
    bands:
      - { max: 40, label: "one" }
      - { max: 70, label: "two" }
      - { max: 100, label: "three" }
      - { max: 130, label: "four" }
      - { max: 9999, label: "five" }
```

Band labels and edges are placeholders; the main thread will supply the real ones. Substitute `@name` with tracked state before rolling. Show the full breakdown in the panel; speak only the short line.

### 6.3 Tracked state
- Numeric values with defaults from the cue sheet, for example `war_within: 3`, `integrity_lost: 0`, `il_multiplier: 8`, `castor_turned: 0`.
- `set <name> <number>` updates by alias ("set war within two", "set integrity lost three").
- Shown and editable in the side panel. Saved in `chrome.storage.local` so a reload doesn't lose it.

## 7. Claude lookups

- Called from the **service worker** only, with `fetch` to `https://api.anthropic.com/v1/messages`.
  - Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Add `api.anthropic.com` to `host_permissions`.
- Model: configurable, default `claude-haiku-4-5`. `max_tokens: 200`.
- System prompt: a fixed instruction plus the **rules digest** (a Markdown file the GM uploads in options), with `cache_control: { type: "ephemeral" }` on the digest block so repeat questions are cheap and fast.
- Fixed instruction (verbatim):
  > You are a stagehand whispering to a game master mid-session. Answer in one or two short spoken sentences. Use only the rules digest. End with the section name in brackets. If the digest doesn't answer it, say "Not in the digest."
- Speak the answer, minus the bracketed section; show the full answer with the section in the panel.
- Timeout after 8 seconds and speak "Lookup timed out."
- Keep the last 3 question and answer pairs as conversation context, so "and what about at three players?" works.
- Store the API key in `chrome.storage.local`, entered in options, and never send it to the page.

## 8. Cue sheet

A YAML or JSON file the GM uploads in options. It's the single source of truth for cue order, aliases, hotkeys and actions.

```yaml
version: 1
black_scene: "Black"
cues:
  - id: scene_19_bathhouse
    label: "The Bathhouse"
    voice: ["bathhouse", "bath house", "the tub"]
    hotkey: "Ctrl+Alt+9"
    actions:
      - { type: scene, name: "Bathhouse" }
      - { type: playlist, name: "Satie" }
    manual_fallback: "Scenes > Bathhouse > Activate"
  - id: kill_audio
    label: "Kill all audio"
    voice: ["kill audio", "silence"]
    hotkey: "Ctrl+Alt+0"
    actions:
      - { type: stop_all }
handouts:
  - id: harding_portrait
    voice: ["harding", "sergeant portrait"]
    src: "worlds/whispering-crash/handouts/harding.webp"
state:
  war_within: 3
  integrity_lost: 0
  il_multiplier: 8
  castor_turned: 0
named_rolls: []
```

- Action types: `scene`, `playlist`, `sound`, `stop_all`, `oneshot`, `handout`, `wait` (milliseconds, for sequenced cues such as "kill audio, wait 3000, play organ").
- `next scene` and `previous scene` walk the `cues` list in order, skipping cues that have no `scene` action.
- **Hotkeys:** each cue may define one. The page listens for it when the Foundry tab is focused, so a Stream Deck "Hotkey" button fires the cue with no voice and no AI.
- Validate on upload. Unknown action types, duplicate ids, missing scene names (checked against `game.scenes` the next time Foundry loads) and alias collisions are listed as errors in options.

## 9. Side panel

One screen, readable at a glance:
- **Status:** listening / idle / error, mic and Foundry connection dots.
- **Heard:** live transcript.
- **Did:** the last action and its spoken confirmation.
- **Now:** the current cue. **Next:** the next three cues, each a clickable button.
- **State:** the tracked values, editable.
- **Last lookup:** question, answer and section.
- **Big buttons:** Panic, Kill audio, Previous, Next.

## 10. Options page

- Upload the cue sheet; show validation results.
- Upload the rules digest (Markdown); show its size.
- Claude API key, model and a "test lookup" button.
- Recognition language, push-to-talk key, match threshold.
- TTS voice and rate, with a "test voice" button.
- Extra Foundry origins.

## 11. Repo layout

```
stagehand/
  manifest.json
  src/
    main-world/        # touches game, mic, TTS
      index.js
      foundryAdapter.js
      speech.js
      tts.js
      hotkeys.js
    content/bridge.js  # isolated-world relay
    worker/
      index.js         # router
      claude.js
      storage.js
    shared/            # pure, unit-tested
      normalize.js
      dice.js
      grammar.js
      match.js
      cuesheet.js      # schema + validation
    panel/  (html, js, css)
    options/ (html, js, css)
  test/                # unit tests for src/shared
  examples/cuesheet.example.yaml
  README.md            # install, setup, test checklist
```

Use plain JavaScript or TypeScript with a simple bundler (Vite or esbuild). No framework required for the panel.

## 12. Acceptance tests

**Unit (must pass in CI, no browser):**
1. Normalizing "Roll a D twenty plus five" gives `roll 1d20+5`.
2. "roll two d six keep highest one" parses to `2d6kh1`; "roll with advantage" parses to `2d20kh`.
3. "bath house" matches the Bathhouse cue; "bat house" matches only if above threshold; "hello there" matches nothing.
4. Two cues with near-identical aliases: an ambiguous phrase matches neither (margin rule).
5. Named-roll formula substitution with state `{war_within: 2, integrity_lost: 3, il_multiplier: 8, castor_turned: 0}` produces `1d100 + 3*8 + 2*10 + (0*10)`.
6. Cue-sheet validation catches a duplicate id, an unknown action type and an alias collision.

**Manual (README checklist, on a real Forge game):**
1. Hold the key, say "next scene": the TV client switches scene and its music starts. Under 1.5 s.
2. "kill audio": all music stops on the TV client.
3. "roll a d100": the total is spoken in the earbud and appears in chat for the GM only. Players' chat shows nothing.
4. "show harding": the image pops up on the TV client.
5. A question gets a one-or-two sentence spoken answer within 4 s, and the panel shows the section.
6. With the extension active, music does not play through the GM machine.
7. The hotkey for each cue fires it with the mic unplugged.
8. Panic: audio stops and the black scene shows.
9. With the internet disconnected: hotkeys and panel buttons report errors clearly, and nothing hangs the Foundry tab.
10. Logged in as a player instead of the GM: the extension stays inert.

## 13. Out of scope for v1

- Any always-listening or wake-word mode
- Speaker identification
- Audio to a single player's device
- Editing Foundry scenes or playlists from the extension
- Mobile support

## 14. Notes for the agent

- You cannot run Foundry in CI. Put Foundry calls behind `foundryAdapter.js` with a mock for tests, and keep all logic that can be pure in `src/shared/`.
- Verify the Foundry API names in §5 and §6 against the target version before writing the adapter. Flag any that don't exist instead of guessing.
- Don't add dependencies for things the browser already does (speech, TTS, fetch).
- Ask before changing the grammar, the safety rules in §1, or the out-of-scope list.