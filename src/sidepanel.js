import { blobToDataUrl, fitImage } from "./image.js";

const els = {
  text: document.getElementById("text"),
  run: document.getElementById("run"),
  pick: document.getElementById("pick"),
  file: document.getElementById("file"),
  clear: document.getElementById("clear"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  history: document.getElementById("history"),
  shot: document.getElementById("shot"),
  shotImg: document.getElementById("shot-img"),
  shotNote: document.getElementById("shot-note"),
  shotClear: document.getElementById("shot-clear"),
  drop: document.getElementById("drop")
};

let currentContext = "";
// The picture waiting to be read. Cleared once the model has transcribed it —
// the transcription lands in the textarea, so a second Explain works on text
// the learner can correct first.
let currentImage = null;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
  els.status.hidden = !message;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function card(title, ...children) {
  const box = el("div", "card");
  if (title) box.appendChild(el("h2", null, title));
  children.filter(Boolean).forEach((c) => box.appendChild(c));
  return box;
}

function showImage(dataUrl, note = "Ready to read") {
  currentImage = dataUrl;
  els.shotImg.src = dataUrl;
  els.shotNote.textContent = note;
  els.shot.hidden = false;
}

function clearImage() {
  currentImage = null;
  els.shot.hidden = true;
  els.shotImg.removeAttribute("src");
  els.shotNote.textContent = "";
}

/** Accepts a File or Blob from the picker, a drop or a paste. */
async function takeImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("That file is not a picture.", true);
    return;
  }
  try {
    showImage(await fitImage(await blobToDataUrl(file)));
    setStatus("");
    run();
  } catch (err) {
    setStatus(err.message || "Could not read that picture.", true);
  }
}

function render(data, meta) {
  els.result.replaceChildren();
  els.result.hidden = false;

  const head = card(null);
  head.appendChild(el("div", "translation", data.translation || "—"));
  if (data.literal) head.appendChild(el("div", "literal", `Literally: ${data.literal}`));
  const tags = el("div", "meta");
  tags.style.marginTop = "8px";
  if (data.cefr) tags.appendChild(el("span", "badge", data.cefr));
  if (data.register) tags.appendChild(el("span", "tag", data.register));
  tags.appendChild(
    el("span", null, `  ${meta.provider}${meta.fellBack ? " (fallback)" : ""}`)
  );
  head.appendChild(tags);
  els.result.appendChild(head);

  if (meta.fromImage && data.source_text) {
    els.result.appendChild(card("Read from the picture", el("div", "source", data.source_text)));
  }

  if (Array.isArray(data.breakdown) && data.breakdown.length) {
    const table = el("table");
    for (const item of data.breakdown) {
      const tr = el("tr");
      const left = el("td", "tok", item.text ?? "");
      const right = el("td");
      right.appendChild(el("div", null, item.meaning ?? ""));
      const bits = [item.lemma, item.pos, item.form].filter(Boolean).join(" · ");
      if (bits || item.register) {
        const line = el("div", "meta", bits);
        // Register rides on the same line as the grammar bits: it is one more
        // fact about the word, not a warning.
        if (item.register) line.appendChild(el("span", "tag", item.register));
        right.appendChild(line);
      }
      if (item.false_friend) right.appendChild(el("div", "warn", item.false_friend));
      if (item.note) right.appendChild(el("div", "meta", item.note));
      tr.append(left, right);
      table.appendChild(tr);
    }
    els.result.appendChild(card("Word by word", table));
  }

  if (Array.isArray(data.grammar) && data.grammar.length) {
    const list = el("ul");
    data.grammar.forEach((g) => list.appendChild(el("li", null, g)));
    els.result.appendChild(card("Grammar", list));
  }

  if (Array.isArray(data.phrases) && data.phrases.length) {
    const list = el("ul");
    data.phrases.forEach((p) => {
      const li = el("li");
      li.appendChild(el("span", "tok", p.sv ?? ""));
      li.appendChild(el("span", null, ` — ${p.en ?? ""}`));
      if (p.note) li.appendChild(el("div", "meta", p.note));
      list.appendChild(li);
    });
    els.result.appendChild(card("Expressions", list));
  }

  if (Array.isArray(data.upgrades) && data.upgrades.length) {
    const box = el("div");
    data.upgrades.forEach((u) => {
      const row = el("div", "up");
      const line = el("div");
      line.appendChild(el("span", "up-basic", u.basic ?? ""));
      line.appendChild(el("span", "up-arrow", " → "));
      line.appendChild(el("span", "tok", u.better ?? ""));
      if (u.en) line.appendChild(el("span", "meta", `  ${u.en}`));
      row.appendChild(line);
      if (u.note) row.appendChild(el("div", "meta", u.note));
      box.appendChild(row);
    });
    els.result.appendChild(card("Say it at B1", box));
  }

  if (Array.isArray(data.examples) && data.examples.length) {
    const box = el("div");
    data.examples.forEach((x) => {
      const wrap = el("div", "ex");
      wrap.appendChild(el("div", "sv", x.sv ?? ""));
      wrap.appendChild(el("div", "en", x.en ?? ""));
      box.appendChild(wrap);
    });
    els.result.appendChild(card("Practice", box));
  }
}

async function run() {
  const text = els.text.value.trim();
  const image = currentImage;
  if (!text && !image) {
    setStatus("Select or paste some text, or drop a picture, first.", true);
    return;
  }
  els.run.disabled = true;
  els.result.hidden = true;
  setStatus(image ? "Reading the picture…" : "Asking the tutor…");

  const response = await chrome.runtime.sendMessage({
    type: "analyse",
    text,
    context: currentContext,
    image
  });

  els.run.disabled = false;
  if (!response?.ok) {
    if (image) els.shotNote.textContent = "Could not be read";
    setStatus(response?.error || "Something went wrong.", true);
    return;
  }

  const transcription = (response.result?.source_text || "").trim();
  if (image) {
    // Hand the transcription over to the textarea and retire the picture, so
    // the learner can fix a misread word and explain it again as plain text.
    currentImage = null;
    if (transcription) {
      els.text.value = transcription;
      els.shotNote.textContent = "Read";
    } else if ((response.result?.translation || "").trim()) {
      // Something was read, the model just skipped the transcription field.
      els.shotNote.textContent = "Read";
    } else {
      els.shotNote.textContent = "No Swedish text found";
      setStatus("No readable Swedish text in that picture.", true);
      render(response.result, { ...response, fromImage: true });
      return;
    }
  }

  setStatus("");
  render(response.result, { ...response, fromImage: Boolean(image) });
  loadHistory();
}

function accept(payload) {
  if (!payload) return;
  currentContext = payload.context || "";

  if (payload.image) {
    els.text.value = "";
    showImage(
      payload.image,
      payload.hint === "whole-view" ? "The whole visible page" : "Ready to read"
    );
    run();
    return;
  }

  if (payload.text) {
    clearImage();
    els.text.value = payload.text;
    run();
    return;
  }

  if (payload.hint === "capture") {
    setStatus(payload.error || "Chrome would not let the extension read that picture.", true);
    return;
  }

  if (payload.hint === "pdf") {
    setStatus(
      "No selection was available on that page. In a PDF, select the text and use the right-click menu, or press Alt+Shift+S to read the page as a picture.",
      true
    );
  }
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  els.history.replaceChildren();
  history.slice(0, 15).forEach((entry) => {
    const li = el("li", null, `${entry.fromImage ? "🖼 " : ""}${entry.text.slice(0, 70)}`);
    li.title = entry.translation;
    li.addEventListener("click", () => {
      clearImage();
      els.text.value = entry.text;
      currentContext = "";
      run();
    });
    els.history.appendChild(li);
  });
}

els.run.addEventListener("click", run);
els.clear.addEventListener("click", () => {
  els.text.value = "";
  currentContext = "";
  clearImage();
  els.result.hidden = true;
  setStatus("");
});

els.shotClear.addEventListener("click", clearImage);
els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => {
  takeImageFile(els.file.files?.[0]);
  els.file.value = "";
});

document.addEventListener("paste", (event) => {
  const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
    i.type.startsWith("image/")
  );
  if (!item) return; // a plain-text paste belongs to the textarea
  event.preventDefault();
  takeImageFile(item.getAsFile());
});

let dragDepth = 0;
document.addEventListener("dragenter", (event) => {
  if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
  dragDepth += 1;
  els.drop.hidden = false;
});
document.addEventListener("dragover", (event) => {
  if (!els.drop.hidden) event.preventDefault();
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.drop.hidden = true;
});
document.addEventListener("drop", (event) => {
  if (els.drop.hidden) return;
  event.preventDefault();
  dragDepth = 0;
  els.drop.hidden = true;
  takeImageFile(event.dataTransfer?.files?.[0]);
});
els.text.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "selection") accept(msg.payload);
});

chrome.runtime.sendMessage({ type: "takePending" }).then(accept).catch(() => {});
loadHistory();
