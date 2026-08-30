# Svenska Study Translator

A Chrome extension for studying Swedish. Select any passage — on a web page, in
a PDF opened in Chrome, or inside a picture — and get an AI translation plus a
full grammatical breakdown in the side panel.

## What you get for a selection

- Natural translation, plus a literal rendering when the two differ
- Word-by-word table: lemma, part of speech, inflection (en/ett, definite forms,
  verb group and tense), and meaning
- Grammar notes on the sentence structure (V2, BIFF, particle verbs, agreement)
- Idioms and fixed expressions called out separately
- A rough CEFR level and fresh practice sentences reusing the new vocabulary

### Exam-oriented extras

Three fields aimed at a B1 candidate rather than a casual reader — the things a
test marks down that a plain translation never shows:

| Shown as | What it tells you |
| --- | --- |
| A grey pill beside the CEFR badge, and beside a word's grammar bits | **Register.** Whether the passage or the word is formal, informal, spoken, slang or dated. Neutral Swedish is left unlabelled, so a pill always means "this would stand out". |
| An amber ⚠ line under a word | **False friend.** The word resembles one in your target language or in Finnish but means something else — _rolig_ is fun, not a role; _glass_ is ice cream. Only genuine traps are flagged. |
| A **Say it at B1** card | **Upgrades.** A2 words that actually appear in the passage, paired with a B1 alternative — _bra → utmärkt_, _sa → berättade_ — with a note on when the stronger word fits. Empty when the passage is already at B1. |

## Reading text in pictures

Swedish that is not selectable text — a photographed page, a screenshot, a sign,
a comic panel, subtitles, a scanned worksheet — is read by the model itself and
then studied exactly like a selection. The transcription is shown above the
breakdown and dropped into the input box, so a misread word can be corrected and
explained again as text.

| Where the Swedish is | How to read it |
| --- | --- |
| A picture on a page | Right-click it → *Read the Swedish text in this image* |
| Any area of the screen | `Alt+Shift+S`, then drag a box over it — Esc cancels |
| A PDF, or a page with no content script | `Alt+Shift+S` reads the whole visible page instead |
| A file, a screenshot, a photo | Drop it on the side panel, paste it there, or use **Picture…** |

The right-click path uses the picture at its own resolution when the page lets
it; for a cross-origin image, whose pixels Chrome will not hand over, the area
shown on screen is cropped out of a capture of the tab instead. Pictures are
capped at 2000px on the long side before they are sent.

This needs a vision-capable model. Both defaults are, and any model without
vision will simply return an error from its provider.

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
| A picture | Right-click it → *Read the Swedish text in this image* |
| An area of the screen | `Alt+Shift+S`, then drag a box over the text |
| Anywhere | `Alt+S`, or click the toolbar icon and paste text or a picture into the panel |

### Why PDFs need the right-click menu

Chrome renders PDFs in a separate plugin process that content scripts cannot
reach, so the in-page **SV** button and `Alt+S` have no selection to read there.
The context menu works because Chrome passes the selected text to the extension
itself. That is the supported path for PDFs — local `file://` PDFs included,
once you tick *Allow access to file URLs* in the extension's details page.

For the same reason the drag-a-box reader cannot draw its overlay over a PDF.
`Alt+Shift+S` there falls back to capturing the whole visible page and reading
that, which also covers a scanned PDF with no text layer at all.

## Layout

```
manifest.json         MV3 manifest
src/background.js     service worker: context menus, capture, routing, history
src/providers.js      OpenRouter + Gemini clients, fallback logic
src/prompt.js         the tutor prompt and response schema
src/content.js        in-page selection button (HTML pages only)
src/sidepanel.*       the study panel
src/options.*         API keys, models, target language
```

## Privacy

API keys live in `chrome.storage.sync`. The selected text and a small amount of
surrounding context are sent only to the provider you configured. A picture you
ask it to read goes to that same provider and nowhere else; captures are taken
only when you ask for one, and only of the tab you are looking at. The last 50
lookups are cached locally in `chrome.storage.local` for the history list — the
transcription, never the picture — and never leave the browser.
