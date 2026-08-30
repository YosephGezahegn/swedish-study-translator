// Builds the analysis prompt. Kept in one place so both providers stay in sync.

export const RESPONSE_SCHEMA_HINT = `{
  "source_text": "the Swedish text you read in the picture, transcribed exactly; null when the passage was handed to you as text",
  "source_language": "string, the language you detected",
  "translation": "natural translation into the target language",
  "literal": "word-for-word literal rendering, or null if it adds nothing",
  "breakdown": [
    {
      "text": "the word or chunk exactly as it appears",
      "lemma": "dictionary form",
      "pos": "part of speech",
      "form": "inflection details, e.g. 'present tense', 'definite plural', 'en-word'",
      "meaning": "meaning in the target language",
      "note": "short learner note, or null"
    }
  ],
  "grammar": ["short bullet points about the sentence structure and any rules worth learning"],
  "phrases": [ { "sv": "idiom or fixed expression", "en": "meaning", "note": "why it is not literal" } ],
  "cefr": "rough CEFR level of the passage, e.g. B1",
  "examples": [ { "sv": "a new short example sentence reusing the key vocabulary", "en": "translation" } ]
}`;

const READING_RULES = [
  "The learner sent a picture instead of text: a screenshot, a photo of a page, a sign, a subtitle or a scan.",
  "First read it. Transcribe the Swedish exactly as printed — keep å, ä and ö, keep capitalisation, and join words that a line break split with a hyphen.",
  "Where several blocks of text share the picture, transcribe them in reading order and separate them with blank lines; skip chrome such as menus, buttons, page numbers and watermarks unless that is all there is.",
  "Put the transcription in source_text, then analyse that transcription exactly as you would analyse a selection.",
  "Where a character is genuinely unreadable, write your best guess and say so in a grammar note rather than dropping it.",
  "Where the picture holds no readable text, set source_text to null, translation to \"\", and say so in a single grammar note."
];

export function buildMessages({ text, targetLanguage = "English", context = "", image = false }) {
  const system = [
    "You are a patient Swedish tutor helping a learner study.",
    `Explain everything in ${targetLanguage}.`,
    image
      ? "Read the Swedish in the picture the learner sent, then break it down word by word so they can learn from it."
      : "Analyse the passage the learner selected: translate it, then break it down word by word so they can learn from it.",
    ...(image ? READING_RULES : []),
    "Be precise about Swedish grammar: en/ett gender, definite and indefinite forms, verb groups and tenses, particle verbs, V2 word order, subordinate-clause word order (BIFF), reflexives, and adjective agreement.",
    "If the selection is a fragment or contains OCR/PDF line-break noise, silently repair it and analyse what the author meant.",
    "Reply with a single JSON object and nothing else. No markdown fences, no commentary.",
    "Use exactly this shape (omit optional fields with null or an empty array rather than inventing content):",
    RESPONSE_SCHEMA_HINT
  ].join("\n");

  const user = [
    context ? `Surrounding context (do not translate this, use it only to disambiguate):\n"""${context}"""\n` : "",
    image
      ? text
        ? `Read the attached picture. The learner also typed this, which may be a partial transcription or a question — use it only as a hint:\n"""${text}"""`
        : "Read the attached picture and analyse the Swedish text in it."
      : `Selected passage:\n"""${text}"""`
  ].join("\n");

  return { system, user };
}
