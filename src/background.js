import { analyse, DEFAULTS } from "./providers.js";

const MENU_ID = "svenska-explain";
const MAX_HISTORY = 50;

// Selection handed to the side panel on its next load.
let pending = null;
// Last selection reported by a content script, per tab. PDFs and other
// plugin-rendered documents never report one, which is why the context menu
// (whose selectionText Chrome supplies itself) is the primary entry point.
const lastSelection = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Explain "%s" in Swedish study mode',
    contexts: ["selection"]
  });
  const stored = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...stored });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id != null) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText || "").trim();
  if (!text) return;
  queue({ text, context: lastSelection.get(tab?.id)?.context || "", tabId: tab?.id });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "explain-selection" || !tab?.id) return;
  const remembered = lastSelection.get(tab.id);
  if (remembered?.text) {
    queue({ ...remembered, tabId: tab.id });
    return;
  }
  // No content-script selection (PDF viewer, restricted page): open the panel
  // so the learner can paste, and tell them why.
  queue({ text: "", context: "", tabId: tab.id, hint: "pdf" });
});

function queue({ text, context, tabId, hint }) {
  pending = { text, context, hint, at: Date.now() };
  if (tabId != null) chrome.sidePanel.open({ tabId });
  // The panel may already be open, in which case it is listening.
  chrome.runtime.sendMessage({ type: "selection", payload: pending }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => lastSelection.delete(tabId));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "selectionChanged") {
    if (sender.tab?.id != null) {
      lastSelection.set(sender.tab.id, { text: msg.text, context: msg.context });
    }
    return false;
  }

  if (msg?.type === "explainSelection") {
    // Sent by the in-page floating button.
    queue({ text: msg.text, context: msg.context, tabId: sender.tab?.id });
    return false;
  }

  if (msg?.type === "takePending") {
    const payload = pending;
    pending = null;
    sendResponse(payload);
    return false;
  }

  if (msg?.type === "analyse") {
    (async () => {
      try {
        const settings = await chrome.storage.sync.get(null);
        const { result, provider, fellBack } = await analyse({
          text: msg.text,
          context: msg.context,
          settings
        });
        await remember(msg.text, result);
        sendResponse({ ok: true, result, provider, fellBack });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async response
  }

  return false;
});

async function remember(text, result) {
  const { history = [] } = await chrome.storage.local.get("history");
  const entry = {
    text,
    translation: result?.translation ?? "",
    at: Date.now()
  };
  const next = [entry, ...history.filter((h) => h.text !== text)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ history: next });
}
