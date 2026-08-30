import { DEFAULTS } from "./providers.js";

const FIELDS = [
  "provider",
  "openrouterKey",
  "openrouterModel",
  "geminiKey",
  "geminiModel",
  "targetLanguage"
];

const status = document.getElementById("status");
const fallback = document.getElementById("fallback");

function show(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = !message;
}

async function load() {
  const stored = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  FIELDS.forEach((id) => {
    document.getElementById(id).value = stored[id] ?? "";
  });
  fallback.checked = stored.fallback !== false;
}

async function save() {
  const values = Object.fromEntries(
    FIELDS.map((id) => [id, document.getElementById(id).value.trim()])
  );
  values.fallback = fallback.checked;
  await chrome.storage.sync.set(values);
  show("Saved.");
}

document.getElementById("save").addEventListener("click", save);

document.getElementById("test").addEventListener("click", async () => {
  await save();
  show("Testing…");
  const res = await chrome.runtime.sendMessage({
    type: "analyse",
    text: "Jag har bott i Sverige i tre år.",
    context: ""
  });
  if (res?.ok) {
    show(`Works — answered by ${res.provider}${res.fellBack ? " (fallback)" : ""}: "${res.result.translation}"`);
  } else {
    show(res?.error || "Test failed.", true);
  }
});

load();
