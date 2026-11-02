# Stagehand 0.2.7

Built from repository commit `55b6903` in the existing checkout, using the supplied 0.2.6 extension and patch notes as references. For review before installation; no extension was installed and no release was published.

## Changes

- Folded all documented 0.2.1–0.2.6 dist patches into source: private roll mode selection (`self`, then `selfroll`, then whisper-only); typing-safe push-to-talk; handout hotkeys; combined cue/handout bare-name matching; persistent music; optional `nav: false`; macros; and both initiative word orders with unique combatant matching and optional leading “the”.
- Added fallback matching for “open”, “go to”, “switch to”, “cut to”, “show”, “bring up”, and “pull up”. The full phrase wins first. Stripping happens only when its best score is below the configured threshold; ambiguity still blocks execution.
- Drop normalized empty, single-character, and specified filler transcripts before lookup, with “Didn't catch that” displayed and spoken and an explicit dropped reason in the event log. Meaningful recognition alternatives remain usable, and meaningful unmatched speech still reaches Claude.
- Log each sent Claude lookup as a `lookup` event using the existing log envelope and `duration` field in milliseconds, plus `ok` and failure error class. Timing includes response parsing and failures, timeouts, cancellation, and superseded requests. Local missing-key/digest errors send no request and have no network timing record. Request bodies, keys, and digests are excluded.
- Added optional cue `pattern` regexes, validated at sheet load with cue-specific errors. Patterns run after initiative and before bare-name matching. Named groups reach every macro action as scope; digit-only values become numbers, other values stay strings, and unmatched optional groups are omitted. Existing number-word normalization covers zero through sixty. Pattern-only cues may omit voice aliases; ordinary sheets and no-argument macros still work.
- Set manifest, package, and lockfile versions to 0.2.7 without dependency changes.

## Reference discrepancies and compatibility

The repository was 0.2.0. Its initial build differed from the supplied 0.2.6 build only in the documented patches and version; panel, options, bridge, and existing runtime/storage safeguards already matched. The notes' misleading filename still covers every required patch. No undocumented patch was guessed.

The reference routes `show …` directly to handouts, skipping full-phrase cues. This changed as required so a real cue named “show timer” can win, and stripped matches share one ambiguity check across cues and handouts.

Regression tests exposed two conflicts between documented initiative support and reference normalization: literal `bard 17` became `bard17`, and negative numbers lost their separating space. A word boundary now limits the initial dice-token join to a standalone `d`; initiative parsing accepts the normalized minus sign in both word orders. The same boundary correction restores `set castor turned 3`, previously merged to `turned3`; dice behavior remains covered by existing tests.

No permissions, storage keys, defaults, hotkey bindings, settings migration, panel code, or dependencies changed. Serialized state/view writes, rapid-navigation reservations, immediate cue routing during lookups, GM checks, privacy, and microphone protections remain in place.

## Validation

- Baseline: all 54 existing tests passed and the original source built successfully.
- Final: `npm run check` passed all **79 tests** and built successfully; `npm run package` also passed.
- Automated tests use mocked browser/Foundry/network APIs. Coverage includes grammar and validation, initiative selection/rejection, both timer phrases through worker → runtime → real adapter → mocked macro `execute({minutes: 5})`, every integer word from zero through sixty, filler avoiding fetch, successful/failing lookup timing, a shortened real abort-signal timeout, typing guards, handout hotkeys, navigation exclusions, concurrency, and existing recovery/privacy protections.
- Compared 62 unchanged routing examples directly with functions extracted from the supplied 0.2.6 bundle. Separately identified the normalization corrections above.
- All seven panel/options/bridge build files are byte-identical to 0.2.6. The manifest differs only in version, including identical permissions, origins, and Chrome command bindings. Storage and runtime source are unchanged.
- Package integrity checked: only the ten built `dist/` files; `manifest.json` at root, version 0.2.7; no source, tests, dependencies, credentials, or local settings. Extract and load unpacked without Node.

Real Chrome installation, live Foundry execution, microphone recognition, and a live Claude request were not tested. Core Foundry's existing remote image-closing and remote non-playlist sound-stopping limitations remain.
