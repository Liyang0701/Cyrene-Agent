# Character Fidelity Harness

`Character Fidelity Harness` is the local-only evaluation path for comparing the frozen engineering Hoshino package with a later candidate package. It does not install either version, switch the Active Character, or touch relationship and memory state.

## Local data boundary

Keep all baselines, sessions, anonymous answers, hidden mappings, and scores outside Git. A suitable local root is:

```text
$HOME/Documents/二次元/.local/runtime/character-fidelity/
```

The repository also ignores `character-fidelity-private/` if a private root is temporarily created under the repository. Do not commit `baseline.json`, `review.json`, `private-metadata.json`, `scores.json`, raw captures, voice assets, or user comments.

The baseline file is content-addressed and written as mode `0444`. A repeat freeze with identical content returns `already-frozen`; a changed package is refused rather than overwriting the baseline.

## Freeze the current engineering package

Run this from the repository root. It writes only a summary to the terminal; the snapshot body remains in the private file.

```bash
npm run fidelity -- freeze \
  --source "$HOME/Documents/二次元/.local/runtime/character-packages/local.hoshino-1.0.1" \
  --out "$HOME/Documents/二次元/.local/runtime/character-fidelity/baselines/hoshino-engineering-v1"
```

## Run an anonymous A/B session

Use this only after a candidate package exists. The candidate must have the same `Character ID` and response language as the baseline, but different Character Content. It is read directly and is not imported into Cyrene.

```bash
npm run fidelity -- run \
  --baseline "$HOME/Documents/二次元/.local/runtime/character-fidelity/baselines/hoshino-engineering-v1/baseline.json" \
  --candidate "/absolute/path/to/local.hoshino-candidate" \
  --prompts "$PWD/test-fixtures/fidelity/hoshino-prompts.v1.json" \
  --out "$HOME/Documents/二次元/.local/runtime/character-fidelity/sessions/hoshino-candidate-v1" \
  --session-id "hoshino-candidate-v1" \
  --model "$HOME/Documents/local-llms/qwen3.5-9b/model" \
  --seed 20260719
```

The checked-in `hoshino-prompts.v1.json` has 30 fixed prompts across daily, comfort, serious, relationship, canon, assistant, and phone contexts. Five key prompts repeat three times, producing 40 anonymous pairs and 80 local model requests.

Review only `review.json` before scoring. It exposes A/B answers but not their version mapping. Do not open `private-metadata.json` until review is complete.

## Record scores and reveal the aggregate

Create a private JSON file containing A/B choices and ratings. It must not contain `baseline` or `candidate` labels.

```json
[
  {
    "pairId": "daily-rest--01",
    "preference": "B",
    "ratings": {
      "A": { "fidelity": 3, "japaneseNaturalness": 3, "acceptable": true },
      "B": { "fidelity": 5, "japaneseNaturalness": 5, "acceptable": true }
    },
    "note": "Optional local-only note"
  }
]
```

```bash
npm run fidelity -- score \
  --session "$HOME/Documents/二次元/.local/runtime/character-fidelity/sessions/hoshino-candidate-v1" \
  --scores "/absolute/path/to/private-scores.json"

npm run fidelity -- report \
  --session "$HOME/Documents/二次元/.local/runtime/character-fidelity/sessions/hoshino-candidate-v1"
```

The report checks hard failures first, then calculates the candidate’s blinded preference rate, median fidelity and Japanese-naturalness ratings, per-category acceptance, and repeated-template risk. It never auto-accepts a character: `criteria-met-awaiting-user-decision` still requires explicit user approval.

## Hard-rule scope

The automatic layer reports explainable failures for identity/Cyrene imagery leaks, unapproved form references, fabricated shared history, non-Japanese output, damaged protected tool text, Chinese translation mixed into the original, repeated catchphrases, and prompt-declared irrelevant plot terms. It does not claim to decide whether a reply truly feels like Hoshino; that remains the user’s blind review.
