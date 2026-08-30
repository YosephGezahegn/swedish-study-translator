// Runs on normal HTML pages. Chrome's built-in PDF viewer renders in a plugin
// process where this script cannot see the selection at all — there the right
// click menu is the entry point, and it works because Chrome passes
// selectionText to the extension itself.

const BUTTON_ID = "__svenska_study_button__";
const OVERLAY_ID = "__svenska_study_overlay__";
const TOP_FRAME = window.top === window;

let button = null;
let hideTimer = null;

function contextAround(selection) {
  try {
    const node = selection.anchorNode;
    const block = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const text = block?.closest("p, li, td, blockquote, div")?.innerText ?? "";
    return text.trim().slice(0, 1200);
  } catch {
    return "";
  }
}

function removeButton() {
  button?.remove();
  button = null;
}

function showButton(x, y, text, context) {
  removeButton();
  button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = "SV";
  button.title = "Explain this Swedish text";
  Object.assign(button.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    zIndex: "2147483647",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    font: "600 12px/1 system-ui, sans-serif",
    color: "#00297a",
    background: "#fecc02",
    boxShadow: "0 2px 8px rgba(0,0,0,.3)"
  });
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "explainSelection", text, context });
    removeButton();
  });
  document.body.appendChild(button);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(removeButton, 6000);
}

document.addEventListener("selectionchange", () => {
  const selection = document.getSelection();
  const text = (selection?.toString() || "").trim();
  if (!text) return;
  chrome.runtime.sendMessage({
    type: "selectionChanged",
    text,
    context: contextAround(selection)
  }).catch(() => {});
});

document.addEventListener("mouseup", (event) => {
  if (event.target?.id === BUTTON_ID) return;
  // A drag that ended in the area reader is not a text selection.
  if (snip || event.target?.id === OVERLAY_ID) return;
  setTimeout(() => {
    const selection = document.getSelection();
    const text = (selection?.toString() || "").trim();
    if (text.length < 2) {
      removeButton();
      return;
    }
    showButton(
      event.pageX + 12,
      event.pageY - 34,
      text,
      contextAround(selection)
    );
  }, 0);
});

document.addEventListener("scroll", removeButton, { passive: true });

/* --------------------------------------------------- reading a screen area */

// Dragging a rectangle over anything on screen — a picture, a screenshot, a
// canvas, a map label, subtitles — and letting the service worker crop it out
// of a capture of the visible tab. Nothing here touches the page's own DOM
// beyond one fixed overlay, so it works over content this script cannot read.

let snip = null;

function toast(message, isError = false) {
  const node = document.createElement("div");
  node.textContent = message;
  Object.assign(node.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    padding: "8px 14px",
    borderRadius: "8px",
    font: "500 13px/1.4 system-ui, sans-serif",
    color: isError ? "#fff" : "#00297a",
    background: isError ? "#d13438" : "#fecc02",
    boxShadow: "0 2px 10px rgba(0,0,0,.3)",
    pointerEvents: "none"
  });
  document.documentElement.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function endSnip() {
  if (!snip) return;
  snip.overlay.remove();
  window.removeEventListener("keydown", snip.onKey, true);
  snip = null;
}

function startSnip() {
  if (snip) return;
  removeButton();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    background: "rgba(0, 41, 122, .18)"
  });

  const band = document.createElement("div");
  Object.assign(band.style, {
    position: "fixed",
    display: "none",
    border: "2px solid #fecc02",
    background: "rgba(254, 204, 2, .12)",
    boxShadow: "0 0 0 9999px rgba(0, 41, 122, .18)",
    pointerEvents: "none"
  });

  const hint = document.createElement("div");
  hint.textContent = "Drag over the Swedish text — Esc to cancel";
  Object.assign(hint.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "6px 12px",
    borderRadius: "8px",
    font: "500 13px/1.4 system-ui, sans-serif",
    color: "#00297a",
    background: "#fecc02",
    boxShadow: "0 2px 10px rgba(0,0,0,.3)",
    pointerEvents: "none"
  });

  overlay.append(band, hint);
  document.documentElement.appendChild(overlay);

  const onKey = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    endSnip();
  };
  window.addEventListener("keydown", onKey, true);

  snip = { overlay, band, hint, onKey, start: null };

  overlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    snip.start = { x: event.clientX, y: event.clientY };
    // The tint would otherwise end up in the screenshot of the selected area.
    band.style.background = "transparent";
    band.style.display = "block";
    overlay.style.background = "transparent";
    overlay.setPointerCapture?.(event.pointerId);
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!snip?.start) return;
    const rect = rectBetween(snip.start, { x: event.clientX, y: event.clientY });
    Object.assign(band.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  });

  overlay.addEventListener("pointerup", (event) => {
    if (!snip?.start) {
      endSnip();
      return;
    }
    const rect = rectBetween(snip.start, { x: event.clientX, y: event.clientY });
    const viewportWidth = window.innerWidth;
    endSnip();
    if (rect.width < 8 || rect.height < 8) {
      toast("Too small — drag a box across the text.", true);
      return;
    }
    // Let the browser paint one frame without the overlay before the worker
    // captures the tab, or the tint lands in the picture.
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        const response = await chrome.runtime
          .sendMessage({ type: "readRegion", rect, viewportWidth })
          .catch(() => null);
        if (response && !response.ok) toast(response.error, true);
      })
    );
  });
}

function rectBetween(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "startRegionSnip") return false;
  if (TOP_FRAME) startSnip();
  sendResponse({ ok: true });
  return false;
});
