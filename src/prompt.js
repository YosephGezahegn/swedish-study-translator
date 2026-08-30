// Builds the analysis prompt. Kept in one place so both providers stay in sync.

export const RESPONSE_SCHEMA_HINT = `{
  "source_text": "the Swedish text you read in the picture, transcribed exactly; null when the passage was handed to you as text",
  "source_language": "string, the language you detected",
  "translation": "natural translation into the target language",
  "literal": "word-for-word literal rendering, or null if it adds nothing",
  "register": "how the passage as a whole sounds: 'neutral', 'formal', 'informal', 'spoken', 'slang' or 'dated'",
  "breakdown": [
    {
      "text": "the word or chunk exactly as it appears",
      "lemma": "dictionary form",
      "pos": "part of speech",
      "form": "inflection details, e.g. 'present tense', 'definite plural', 'en-word'",
      "meaning": "meaning in the target language",
      "register": "'neutral', 'formal', 'informal', 'spoken', 'slang' or 'dated'; null when the word is plain neutral Swedish",
      "false_friend": "short warning when the word resembles a word in the target language or in Finnish but means something else, or null",
      "note": "short learner note, or null"
    }
  ],
  "grammar": ["short bullet points about the sentence structure and any rules worth learning"],
  "phrases": [ { "sv": "idiom or fixed expression", "en": "meaning", "note": "why it is not literal" } ],
  "upgrades": [
    {
      "basic": "an A1-A2 word or phrase actually used in the passage",
      "better": "a B1 word or phrase that could replace it",
      "en": "meaning of the B1 alternative",
      "note": "when the upgrade fits and when it does not, or null"
    }
  ],
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

// Extras aimed at an exam candidate rather than a casual reader: the three
// things a B1 test punishes that a plain translation never shows.
function studyRules(targetLanguage) {
  // Finnish belongs on the list whatever the target language: the learner is
  // most likely sitting YKI. Dedupe so it is not named twice.
  const trapLanguages = [targetLanguage, "Finnish"]
    .filter((lang, i, all) => all.indexOf(lang) === i)
    .join(" or ");

  return [
    "Fill register only where the word or the passage leans away from neutral written Swedish — a formal set phrase, a spoken contraction such as 'dom' or 'nåt', slang, or something dated. Leave it null otherwise rather than labelling every ordinary word.",
    `Fill false_friend only for a real trap: the Swedish word looks or sounds like a word in ${trapLanguages} but means something else (rolig, glass, gift, semester, blank, fart). Say what it is not, then what it is. Never invent a resemblance to fill the field.`,
    "Use upgrades to move the learner from A2 to B1: take words that genuinely appear in the passage and offer a more precise or more idiomatic Swedish alternative — bra to utmärkt or fungerar bra, sa to berättade or påpekade, jättebra to alldeles utmärkt. Explain in note when the upgrade fits, since a stronger word is not always the right one.",
    "Leave upgrades empty when the passage is already at B1 or above, or when every alternative would sound forced. Two or three good upgrades beat a long list."
  ];
}

export function buildMessages({ text, targetLanguage = "English", context = "", image = false }) {
  const system = [
    "You are a patient Swedish tutor helping a learner study.",
    `Explain everything in ${targetLanguage}.`,
    image
      ? "Read the Swedish in the picture the learner sent, then break it down word by word so they can learn from it."
      : "Analyse the passage the learner selected: translate it, then break it down word by word so they can learn from it.",
    ...(image ? READING_RULES : []),
    "Be precise about Swedish grammar: en/ett gender, definite and indefinite forms, verb groups and tenses, particle verbs, V2 word order, subordinate-clause word order (BIFF), reflexives, and adjective agreement.",
    ...studyRules(targetLanguage),
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
