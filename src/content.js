// Runs on normal HTML pages. Chrome's built-in PDF viewer renders in a plugin
// process where this script cannot see the selection at all — there the right
// click menu is the entry point, and it works because Chrome passes
// selectionText to the extension itself.

const BUTTON_ID = "__svenska_study_button__";
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
