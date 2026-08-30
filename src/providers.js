import { buildMessages } from "./prompt.js";
import { splitDataUrl } from "./image.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

export const DEFAULTS = {
  provider: "openrouter",
  openrouterModel: "google/gemini-2.5-flash",
  geminiModel: "gemini-2.5-flash",
  targetLanguage: "English",
  fallback: true
};

class ProviderError extends Error {
  constructor(message, { provider, status } = {}) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

// Models sometimes wrap JSON in prose or fences despite instructions.
function extractJson(raw) {
  if (!raw) throw new Error("The model returned an empty response.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Could not parse the model's response as JSON.");
  }
}

async function callOpenRouter({ system, user, image, settings, signal }) {
  const key = settings.openrouterKey;
  if (!key) throw new ProviderError("No OpenRouter API key saved.", { provider: "openrouter" });

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Title": "Svenska Study Translator"
    },
    body: JSON.stringify({
      model: settings.openrouterModel || DEFAULTS.openrouterModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: image
            ? [
                { type: "text", text: user },
                { type: "image_url", image_url: { url: image } }
              ]
            : user
        }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(
      `OpenRouter returned ${res.status}. ${detail.slice(0, 300)}`,
      { provider: "openrouter", status: res.status }
    );
  }
  const data = await res.json();
  return extractJson(data?.choices?.[0]?.message?.content);
}

async function callGemini({ system, user, image, settings, signal }) {
  const key = settings.geminiKey;
  if (!key) throw new ProviderError("No Google AI Studio API key saved.", { provider: "gemini" });

  const model = settings.geminiModel || DEFAULTS.geminiModel;
  const parts = [{ text: user }];
  if (image) {
    const { mime, base64 } = splitDataUrl(image);
    parts.push({ inlineData: { mimeType: mime, data: base64 } });
  }
  const res = await fetch(GEMINI_URL(model), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(
      `Google AI Studio returned ${res.status}. ${detail.slice(0, 300)}`,
      { provider: "gemini", status: res.status }
    );
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return extractJson(text);
}

const CALLERS = { openrouter: callOpenRouter, gemini: callGemini };

/**
 * Runs the analysis against the preferred provider, falling back to the other
 * one when the first is unconfigured or fails (rate limits, outages).
 *
 * `image` is an optional base64 data URL. When present the model reads the
 * Swedish out of the picture itself and returns the transcription alongside the
 * usual breakdown, so the chosen model has to be a vision model — both defaults
 * are.
 */
export async function analyse({ text, context, image, settings, signal }) {
  const merged = { ...DEFAULTS, ...settings };
  const { system, user } = buildMessages({
    text,
    context,
    image: Boolean(image),
    targetLanguage: merged.targetLanguage
  });

  const order = merged.provider === "gemini" ? ["gemini", "openrouter"] : ["openrouter", "gemini"];
  const tried = merged.fallback ? order : [order[0]];

  let lastError;
  for (const name of tried) {
    try {
      const result = await CALLERS[name]({ system, user, image, settings: merged, signal });
      return { result, provider: name, fellBack: name !== order[0] };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error("No provider available.");
}
