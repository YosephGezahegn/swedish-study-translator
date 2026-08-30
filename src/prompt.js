// Builds the analysis prompt. Kept in one place so both providers stay in sync.

export const RESPONSE_SCHEMA_HINT = `{
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

export function buildMessages({ text, targetLanguage = "English", context = "" }) {
  const system = [
    "You are a patient Swedish tutor helping a learner study.",
    `Explain everything in ${targetLanguage}.`,
    "Analyse the passage the learner selected: translate it, then break it down word by word so they can learn from it.",
    "Be precise about Swedish grammar: en/ett gender, definite and indefinite forms, verb groups and tenses, particle verbs, V2 word order, subordinate-clause word order (BIFF), reflexives, and adjective agreement.",
    "If the selection is a fragment or contains OCR/PDF line-break noise, silently repair it and analyse what the author meant.",
    "Reply with a single JSON object and nothing else. No markdown fences, no commentary.",
    "Use exactly this shape (omit optional fields with null or an empty array rather than inventing content):",
    RESPONSE_SCHEMA_HINT
  ].join("\n");

  const user = [
    context ? `Surrounding context (do not translate this, use it only to disambiguate):\n"""${context}"""\n` : "",
    `Selected passage:\n"""${text}"""`
  ].join("\n");

  return { system, user };
}
