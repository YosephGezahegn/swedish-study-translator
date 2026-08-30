import { analyse, DEFAULTS } from "./providers.js";
import { cropRegion, fitImage } from "./image.js";

const MENU = {
  explain: "svenska-explain",
  image: "svenska-image",
  region: "svenska-region"
};
const MAX_HISTORY = 50;

// Selection handed to the side panel on its next load.
let pending = null;
// Last selection reported by a content script, per tab. PDFs and other
// plugin-rendered documents never report one, which is why the context menu
// (whose selectionText Chrome supplies itself) is the primary entry point.
const lastSelection = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU.explain,
    title: 'Explain "%s" in Swedish study mode',
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: MENU.image,
    title: "Read the Swedish text in this image",
    contexts: ["image"]
  });
  chrome.contextMenus.create({
    id: MENU.region,
    title: "Read Swedish text from a screen area…",
    contexts: ["page", "frame", "image", "selection"]
  });
  const stored = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...stored });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id != null) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU.explain) {
    const text = (info.selectionText || "").trim();
    if (!text) return;
    queue({ text, context: lastSelection.get(tab?.id)?.context || "", tabId: tab?.id });
    return;
  }
  if (info.menuItemId === MENU.image) readImage(info, tab);
  if (info.menuItemId === MENU.region) startRegion(tab);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "read-image-region") {
    startRegion(tab);
    return;
  }
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

function queue({ text = "", context = "", image = null, tabId, hint, error }) {
  pending = { text, context, image, hint, error, at: Date.now() };
  if (tabId != null) chrome.sidePanel.open({ tabId });
  // The panel may already be open, in which case it is listening.
  chrome.runtime.sendMessage({ type: "selection", payload: pending }).catch(() => {});
}

/* ---------------------------------------------------------------- pictures */

/**
 * Runs inside the page to hand back the right-clicked picture. Drawing the
 * element into a canvas keeps the image at its native resolution, which reads
 * far better than a screenshot, but a cross-origin image taints the canvas — in
 * that case only the on-screen rectangle comes back and the worker crops a
 * screenshot instead.
 */
function grabImage(src) {
  const images = Array.from(document.images);
  const el =
    images.find((n) => n.currentSrc === src) ||
    images.find((n) => n.src === src) ||
    null;
  if (!el) return { error: "not-found" };

  if (el.naturalWidth && el.naturalHeight) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = el.naturalWidth;
      canvas.height = el.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(el, 0, 0);
      return { dataUrl: canvas.toDataURL("image/png") };
    } catch {
      // Tainted by a cross-origin source. Fall through to the rectangle.
    }
  }

  el.scrollIntoView({ block: "center", inline: "center" });
  return new Promise((resolve) => {
    // Two frames so the scroll above is painted before the worker screenshots.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        resolve(
          box.width > 1 && box.height > 1
            ? {
                rect: { x: box.left, y: box.top, width: box.width, height: box.height },
                viewportWidth: window.innerWidth
              }
            : { error: "not-visible" }
        );
      })
    );
  });
}

async function readImage(info, tab) {
  if (!tab?.id) return;
  try {
    queue({ image: await imageFromPage(info, tab), tabId: tab.id });
  } catch (err) {
    queue({ tabId: tab.id, hint: "capture", error: err.message || String(err) });
  }
}

async function imageFromPage(info, tab) {
  const src = info.srcUrl || "";
  if (src.startsWith("data:")) return fitImage(src);

  let grabbed = null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: grabImage,
      args: [src]
    });
    grabbed = injection?.result ?? null;
  } catch {
    // Restricted document: nothing to inject into, try the screenshot instead.
  }

  if (grabbed?.dataUrl) return fitImage(grabbed.dataUrl);

  if (!grabbed?.rect || (info.frameId ?? 0) !== 0) {
    throw new Error(
      "Chrome would not let the extension read that image. Drag over it with the screen-area reader (Alt+Shift+S) instead."
    );
  }
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return cropRegion(shot, grabbed.rect, grabbed.viewportWidth);
}

async function startRegion(tab) {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "startRegionSnip" }, { frameId: 0 });
    return;
  } catch {
    // No content script in reach — Chrome's PDF viewer and other plugin
    // documents. The visible tab is still capturable, so read all of it.
  }
  try {
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    queue({ image: await fitImage(shot), tabId: tab.id, hint: "whole-view" });
  } catch (err) {
    queue({ tabId: tab.id, hint: "capture", error: err.message || String(err) });
  }
}

/* ---------------------------------------------------------------- messages */

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

  if (msg?.type === "readRegion") {
    // Sent by the content script once the learner has dragged a rectangle.
    (async () => {
      try {
        const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
          format: "png"
        });
        const image = await cropRegion(shot, msg.rect, msg.viewportWidth);
        queue({ image, context: msg.context || "", tabId: sender.tab.id });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async response
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
          image: msg.image,
          settings
        });
        await remember(msg.text || result?.source_text, result, Boolean(msg.image));
        sendResponse({ ok: true, result, provider, fellBack });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async response
  }

  return false;
});

async function remember(text, result, fromImage = false) {
  const key = (text || "").trim();
  if (!key) return; // nothing was read out of the picture
  const { history = [] } = await chrome.storage.local.get("history");
  const entry = {
    text: key,
    translation: result?.translation ?? "",
    fromImage,
    at: Date.now()
  };
  const next = [entry, ...history.filter((h) => h.text !== key)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ history: next });
}
