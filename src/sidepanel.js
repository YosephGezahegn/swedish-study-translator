const els = {
  text: document.getElementById("text"),
  run: document.getElementById("run"),
  clear: document.getElementById("clear"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  history: document.getElementById("history")
};

let currentContext = "";

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

function render(data, meta) {
  els.result.replaceChildren();
  els.result.hidden = false;

  const head = card(null);
  head.appendChild(el("div", "translation", data.translation || "—"));
  if (data.literal) head.appendChild(el("div", "literal", `Literally: ${data.literal}`));
  const tags = el("div", "meta");
  tags.style.marginTop = "8px";
  if (data.cefr) tags.appendChild(el("span", "badge", data.cefr));
  tags.appendChild(
    el("span", null, `  ${meta.provider}${meta.fellBack ? " (fallback)" : ""}`)
  );
  head.appendChild(tags);
  els.result.appendChild(head);

  if (Array.isArray(data.breakdown) && data.breakdown.length) {
    const table = el("table");
    for (const item of data.breakdown) {
      const tr = el("tr");
      const left = el("td", "tok", item.text ?? "");
      const right = el("td");
      right.appendChild(el("div", null, item.meaning ?? ""));
      const bits = [item.lemma, item.pos, item.form].filter(Boolean).join(" · ");
      if (bits) right.appendChild(el("div", "meta", bits));
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
  if (!text) {
    setStatus("Select or paste some text first.", true);
    return;
  }
  els.run.disabled = true;
  els.result.hidden = true;
  setStatus("Asking the tutor…");

  const response = await chrome.runtime.sendMessage({
    type: "analyse",
    text,
    context: currentContext
  });

  els.run.disabled = false;
  if (!response?.ok) {
    setStatus(response?.error || "Something went wrong.", true);
    return;
  }
  setStatus("");
  render(response.result, response);
  loadHistory();
}

function accept(payload) {
  if (!payload) return;
  currentContext = payload.context || "";
  if (payload.text) {
    els.text.value = payload.text;
    run();
  } else if (payload.hint === "pdf") {
    setStatus(
      "No selection was available on that page. In a PDF, select the text and use the right-click menu.",
      true
    );
  }
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  els.history.replaceChildren();
  history.slice(0, 15).forEach((entry) => {
    const li = el("li", null, entry.text.slice(0, 70));
    li.title = entry.translation;
    li.addEventListener("click", () => {
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
  els.result.hidden = true;
  setStatus("");
});
els.text.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "selection") accept(msg.payload);
});

chrome.runtime.sendMessage({ type: "takePending" }).then(accept).catch(() => {});
loadHistory();
