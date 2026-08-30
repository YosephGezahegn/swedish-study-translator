# Svenska Study Translator

A Chrome extension for studying Swedish. Select any passage — on a web page or
in a PDF opened in Chrome — and get an AI translation plus a full grammatical
breakdown in the side panel.

## What you get for a selection

- Natural translation, plus a literal rendering when the two differ
- Word-by-word table: lemma, part of speech, inflection (en/ett, definite forms,
  verb group and tense), and meaning
- Grammar notes on the sentence structure (V2, BIFF, particle verbs, agreement)
- Idioms and fixed expressions called out separately
- A rough CEFR level and fresh practice sentences reusing the new vocabulary

## Providers

Both are supported and configured independently:

- **OpenRouter** — any model on the platform, default `google/gemini-2.5-flash`
- **Google AI Studio (Gemini)** — default `gemini-2.5-flash`

Pick a preferred provider in settings. With "fall back" enabled, a failure or a
missing key on the preferred one silently retries against the other, so a rate
limit does not interrupt a study session.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open the extension's **Details → Extension options** and paste your API keys
   ([openrouter.ai/keys](https://openrouter.ai/keys),
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
4. Click **Test connection** to confirm

## Using it

| Where | How |
| --- | --- |
| Web page | Select text → click the yellow **SV** button, or right-click → *Explain…* |
| PDF in Chrome | Select text → **right-click → Explain…** |
| Anywhere | `Alt+S`, or click the toolbar icon and paste into the panel |

### Why PDFs need the right-click menu

Chrome renders PDFs in a separate plugin process that content scripts cannot
reach, so the in-page **SV** button and `Alt+S` have no selection to read there.
The context menu works because Chrome passes the selected text to the extension
itself. That is the supported path for PDFs — local `file://` PDFs included,
once you tick *Allow access to file URLs* in the extension's details page.

## Layout

```
manifest.json         MV3 manifest
src/background.js     service worker: context menu, routing, history
src/providers.js      OpenRouter + Gemini clients, fallback logic
src/prompt.js         the tutor prompt and response schema
src/content.js        in-page selection button (HTML pages only)
src/sidepanel.*       the study panel
src/options.*         API keys, models, target language
```

## Privacy

API keys live in `chrome.storage.sync`. The selected text and a small amount of
surrounding context are sent only to the provider you configured. The last 50
lookups are cached locally in `chrome.storage.local` for the history list and
never leave the browser.
