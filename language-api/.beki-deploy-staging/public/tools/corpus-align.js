(() => {
  const API = localStorage.getItem("alignApiBase") || "";
  const LS_KEY = "corpusAlignWorkbench.v1";

  const els = {
    list: document.getElementById("unit-list"),
    metaTitle: document.getElementById("meta-title"),
    metaStats: document.getElementById("meta-stats"),
    unitId: document.getElementById("unit-id"),
    unitStatus: document.getElementById("unit-status"),
    unitRu: document.getElementById("unit-ru"),
    unitIng: document.getElementById("unit-ing"),
    unitNotes: document.getElementById("unit-notes"),
    phraseBody: document.getElementById("phrase-body"),
    wordBody: document.getElementById("word-body"),
    dictQ: document.getElementById("dict-q"),
    dictOut: document.getElementById("dict-out"),
    dictStatus: document.getElementById("dict-status"),
    apiBase: document.getElementById("api-base"),
  };

  let wb = emptyWorkbench();
  let idx = 0;
  let saveTimer = null;

  function emptyWorkbench() {
    return {
      version: 1,
      direction: "ing→ru",
      storyId: "story_draft_001",
      title: "Черновик",
      titleIng: "",
      level: "B1",
      genre: "novella",
      authorRu: "",
      source: "workbench",
      note: "Оригинал ING → смысловой RU → фразы/слова",
      updatedAt: new Date().toISOString(),
      units: [blankUnit("u001")],
    };
  }

  function blankUnit(id) {
    return {
      id: id || `u${Date.now()}`,
      status: "draft",
      ru: "",
      ing: "",
      phrases: [],
      words: [],
      notes: "",
    };
  }

  function apiUrl(path) {
    const base = (els.apiBase.value || API || "").replace(/\/$/, "");
    return `${base}${path}`;
  }

  function current() {
    return wb.units[idx] || null;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      wb.direction = "ing→ru";
      wb.updatedAt = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify(wb));
      renderMeta();
    }, 250);
  }

  function renderMeta() {
    els.metaTitle.textContent = wb.title || wb.storyId || "Workbench";
    const v = wb.units.filter((u) => u.status === "verified").length;
    const needRu = wb.units.filter((u) => (u.ing || "").trim() && !(u.ru || "").trim()).length;
    const ph = wb.units.reduce((n, u) => n + (u.phrases?.length || 0), 0);
    const w = wb.units.reduce((n, u) => n + (u.words?.length || 0), 0);
    els.metaStats.textContent = `${wb.units.length} блоков · ${v} verified · ждут RU: ${needRu} · ${ph} фраз · ${w} слов`;
  }

  function renderList() {
    els.list.innerHTML = "";
    wb.units.forEach((u, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `list-item${i === idx ? " active" : ""}`;
      const preview = u.ing || u.ru || "— пусто —";
      const ruMark = (u.ing || "").trim() && !(u.ru || "").trim() ? " · нет RU" : "";
      btn.innerHTML = `
        <span class="id">${u.id || i + 1} · <span class="badge ${u.status || "draft"}">${u.status || "draft"}</span>${ruMark}</span>
        <span class="preview">${escapeHtml(preview)}</span>`;
      btn.addEventListener("click", () => {
        commitForm();
        idx = i;
        renderAll();
      });
      els.list.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Columns: ING then RU (source → meaning). */
  function renderPairs(tbody, rows, kind) {
    tbody.innerHTML = "";
    (rows || []).forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input data-k="ing" data-i="${i}" value="${escapeHtml(row.ing || "")}" placeholder="ING"></td>
        <td><input data-k="ru" data-i="${i}" value="${escapeHtml(row.ru || "")}" placeholder="RU смысл"></td>
        <td class="act"><button type="button" data-del="${i}" title="Удалить">×</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const u = current();
        if (!u) return;
        const i = Number(inp.dataset.i);
        const k = inp.dataset.k;
        if (!u[kind][i]) u[kind][i] = { ru: "", ing: "" };
        u[kind][i][k] = inp.value;
        scheduleSave();
      });
    });
    tbody.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = current();
        if (!u) return;
        u[kind].splice(Number(btn.dataset.del), 1);
        scheduleSave();
        renderUnit();
      });
    });
  }

  function renderUnit() {
    const u = current();
    if (!u) return;
    els.unitId.value = u.id || "";
    els.unitStatus.value = u.status || "draft";
    els.unitRu.value = u.ru || "";
    els.unitIng.value = u.ing || "";
    els.unitNotes.value = u.notes || "";
    renderPairs(els.phraseBody, u.phrases || [], "phrases");
    renderPairs(els.wordBody, u.words || [], "words");
  }

  function renderAll() {
    renderMeta();
    renderList();
    renderUnit();
  }

  function commitForm() {
    const u = current();
    if (!u) return;
    u.id = els.unitId.value.trim() || u.id;
    u.status = els.unitStatus.value;
    u.ru = els.unitRu.value;
    u.ing = els.unitIng.value;
    u.notes = els.unitNotes.value;
    scheduleSave();
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCorpusStory() {
    commitForm();
    const units = wb.units.filter((u) => u.ru.trim() && u.ing.trim());
    const verified = units.filter((u) => u.status === "verified");
    const use = verified.length ? verified : units;
    const story = {
      id: wb.storyId || "story_draft_001",
      title: wb.title || "Черновик",
      titleIng: wb.titleIng || "",
      level: wb.level || "B1",
      genre: wb.genre || "novella",
      authorRu: wb.authorRu || "",
      translator: "workbench manual ing→ru",
      source: wb.source || "workbench",
      note: wb.note || "ING оригинал → смысловой RU",
      paragraphs: use.map((u) => ({ ru: u.ru.trim(), ing: u.ing.trim() })),
    };
    downloadJson(story, `${story.id}.json`);
  }

  function exportPhrases() {
    commitForm();
    const items = [];
    for (const u of wb.units) {
      if (!(u.ru || "").trim() || !(u.ing || "").trim()) continue;
      items.push({
        id: `${u.id}_sent`,
        ru: u.ru.trim(),
        ing: u.ing.trim(),
        category: "lesson_phrase",
        kind: "sentence",
        unitId: u.id,
        confidence: u.status === "verified" ? 0.97 : 0.85,
      });
      (u.phrases || []).forEach((p, i) => {
        if (!(p.ru || "").trim() || !(p.ing || "").trim()) return;
        items.push({
          id: `${u.id}_ph_${i}`,
          ru: p.ru.trim(),
          ing: p.ing.trim(),
          category: "lesson_phrase",
          kind: "phrase",
          unitId: u.id,
          confidence: u.status === "verified" ? 0.96 : 0.84,
        });
      });
    }
    downloadJson(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        source: "workbench",
        direction: "ing→ru",
        storyId: wb.storyId,
        count: items.length,
        items,
      },
      `${wb.storyId || "draft"}-workbench-phrases.json`
    );
  }

  function looksIngush(q) {
    return /[Ӏӏʼˈ]|[а-яё]{0,3}[аеёиоуыэюя]?[бвгджзйклмнпрстфхцчшщ]*[Ӏӏ]|гӀ|кх|хь|тӀ|дӀ|пӀ|кӀ|цӀ|чӀ|къ|гI|кI|тI|дI/i.test(q)
      || /[аеёиоуыэюя]{2,}.*[ъь]/i.test(q) && /[гкхтдпцч][ӀӏI1]/i.test(q);
  }

  async function lookupDict() {
    const q = els.dictQ.value.trim();
    if (!q) return;
    els.dictStatus.textContent = "Ищу…";
    els.dictOut.innerHTML = "";
    const enc = encodeURIComponent(q);
    const preferIng = looksIngush(q) || /[Ӏӏ]/.test(q) || q.length <= 24;
    const urls = preferIng
      ? [
          { label: "Тариев ING", url: `/lookup/tariev?by=ing&q=${enc}` },
          { label: "корпус", url: `/lookup/corpus?q=${enc}` },
          { label: "уроки ING", url: `/lookup/uroki?by=ing&q=${enc}` },
          { label: "фраза RU", url: `/lookup/phrase?ru=${enc}` },
          { label: "слово RU", url: `/lookup/word?ru=${enc}` },
          { label: "Тариев RU", url: `/lookup/tariev?by=ru&q=${enc}` },
        ]
      : [
          { label: "слово RU", url: `/lookup/word?ru=${enc}` },
          { label: "фраза RU", url: `/lookup/phrase?ru=${enc}` },
          { label: "Тариев RU", url: `/lookup/tariev?by=ru&q=${enc}` },
          { label: "корпус", url: `/lookup/corpus?q=${enc}` },
          { label: "Тариев ING", url: `/lookup/tariev?by=ing&q=${enc}` },
          { label: "уроки", url: `/lookup/uroki?by=ru&q=${enc}` },
        ];
    const chunks = [];
    for (const u of urls) {
      try {
        const res = await fetch(apiUrl(u.url));
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        chunks.push({ label: u.label, items: data.items || [] });
      } catch (e) {
        chunks.push({ label: u.label, error: e.message || String(e) });
      }
    }
    els.dictStatus.textContent = "";
    for (const block of chunks) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="meta" style="margin:8px 0 4px">${escapeHtml(block.label)}</div>`;
      els.dictOut.appendChild(wrap);
      if (block.error) {
        const err = document.createElement("div");
        err.className = "hint";
        err.textContent = `ошибка: ${block.error}`;
        els.dictOut.appendChild(err);
        continue;
      }
      if (!block.items.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "пусто";
        els.dictOut.appendChild(empty);
        continue;
      }
      for (const it of block.items.slice(0, 8)) {
        const ru = it.ru || it.snippet?.ru || "";
        const ing =
          it.ing ||
          it.forms?.base ||
          it.snippet?.ing ||
          it.translation ||
          (preferIng ? q : "");
        const hit = document.createElement("div");
        hit.className = "dict-hit";
        hit.innerHTML = `
          <div class="meta">${escapeHtml(it.source || it.pos || "")}</div>
          <div class="ing">${escapeHtml(ing || "—")}</div>
          <div>${escapeHtml(ru || "—")}</div>
          <div class="actions">
            <button type="button" data-as="phrase">+ фраза</button>
            <button type="button" data-as="word">+ слово</button>
            <button type="button" data-as="ru">в RU перевод</button>
            <button type="button" data-as="ing">в ING</button>
          </div>`;
        hit.querySelectorAll("button").forEach((btn) => {
          btn.addEventListener("click", () => {
            const u = current();
            if (!u) return;
            if (btn.dataset.as === "phrase") {
              u.phrases = u.phrases || [];
              u.phrases.push({ ru: ru || q, ing: ing || q });
            } else if (btn.dataset.as === "word") {
              u.words = u.words || [];
              u.words.push({ ru: ru || "", ing: ing || q, pos: it.pos || "", note: "" });
            } else if (btn.dataset.as === "ru") {
              const cur = els.unitRu.value.trim();
              const add = ru || "";
              if (add) {
                els.unitRu.value = cur ? `${cur} ${add}` : add;
                commitForm();
              }
            } else if (btn.dataset.as === "ing") {
              const cur = els.unitIng.value.trim();
              const add = ing || q;
              els.unitIng.value = cur ? `${cur} ${add}` : add;
              commitForm();
            }
            scheduleSave();
            renderUnit();
            renderList();
          });
        });
        els.dictOut.appendChild(hit);
      }
    }
  }

  function splitClauses(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    const parts = [];
    let buf = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      buf += ch;
      if (",.!?;:".includes(ch) || ch === "—" || ch === "–") {
        if (ch === "." && /\d/.test(s[i - 1] || "")) continue;
        const piece = buf.trim();
        if (piece.length > 1) parts.push(piece);
        buf = "";
        while (s[i + 1] === " ") i++;
      }
    }
    const tail = buf.trim();
    if (tail) parts.push(tail);
    return parts.filter((p) => p.replace(/[,.!?;:—–]/g, "").trim().length > 0);
  }

  function splitIngToUnits() {
    const text = prompt("Вставь ингушский текст — разобью по запятым и точкам (draft):");
    if (!text) return;
    const parts = splitClauses(text);
    if (!parts.length) return;
    commitForm();
    const start = wb.units.length + 1;
    for (let i = 0; i < parts.length; i++) {
      const u = blankUnit(`u${String(start + i).padStart(3, "0")}`);
      u.ing = parts[i];
      wb.units.push(u);
    }
    idx = wb.units.length - parts.length;
    scheduleSave();
    renderAll();
  }

  function splitCurrentUnit() {
    commitForm();
    const u = current();
    if (!u) return;
    const parts = splitClauses(u.ing);
    if (parts.length <= 1) {
      alert("Нечего резать: мало запятых/точек в ING");
      return;
    }
    if (!confirm(`Разрезать текущий блок на ${parts.length} кусков по , . ?`)) return;
    const ruParts = splitClauses(u.ru);
    const neu = parts.map((ing, i) => {
      const nu = blankUnit(`${u.id}_${i + 1}`);
      nu.ing = ing;
      nu.ru = ruParts.length === parts.length ? ruParts[i] : i === 0 ? u.ru : "";
      nu.status = "draft";
      nu.notes = "разрезано по , . — проверь RU";
      nu.phrases = [];
      nu.words = [];
      return nu;
    });
    wb.units.splice(idx, 1, ...neu);
    scheduleSave();
    renderAll();
  }

  function tokenizeIng(text) {
    return String(text || "")
      .split(/[\s,.;:!?…«»"()\[\]—–\-]+/u)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  }

  async function suggestWordsFromIng() {
    const u = current();
    if (!u) return;
    commitForm();
    const tokens = tokenizeIng(u.ing);
    if (!tokens.length) {
      alert("Сначала вставь ингушский текст");
      return;
    }
    els.dictStatus.textContent = `Разбор ${tokens.length} слов…`;
    u.words = u.words || [];
    const have = new Set(u.words.map((w) => (w.ing || "").toLowerCase()));
    let added = 0;
    for (const tok of tokens.slice(0, 40)) {
      if (have.has(tok.toLowerCase())) continue;
      let ru = "";
      try {
        const res = await fetch(apiUrl(`/lookup/tariev?by=ing&q=${encodeURIComponent(tok)}&limit=3`));
        const data = await res.json();
        const hit = (data.items || [])[0];
        if (hit?.ru) ru = hit.ru;
      } catch {
        /* ignore */
      }
      if (!ru) {
        try {
          const res = await fetch(apiUrl(`/lookup/corpus?q=${encodeURIComponent(tok)}`));
          const data = await res.json();
          const sn = (data.items || [])[0]?.snippet;
          if (sn?.ru) ru = sn.ru.slice(0, 80);
        } catch {
          /* ignore */
        }
      }
      u.words.push({ ru, ing: tok, pos: "", note: ru ? "auto" : "нужен перевод" });
      have.add(tok.toLowerCase());
      added += 1;
    }
    els.dictStatus.textContent = `Добавлено слов: ${added}. Поправь RU.`;
    scheduleSave();
    renderUnit();
    renderMeta();
  }

  function addPhraseFromSelection() {
    const u = current();
    if (!u) return;
    const sel = window.getSelection?.()?.toString()?.trim() || "";
    const ing = sel || prompt("ING кусок из предложения:") || "";
    if (!ing) return;
    const ru = prompt("RU смысл этого куска:") || "";
    u.phrases = u.phrases || [];
    u.phrases.push({ ru, ing });
    scheduleSave();
    renderUnit();
  }

  ["unit-id", "unit-status", "unit-ru", "unit-ing", "unit-notes"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      commitForm();
      renderList();
      renderMeta();
    });
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    commitForm();
    idx = Math.max(0, idx - 1);
    renderAll();
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    commitForm();
    idx = Math.min(wb.units.length - 1, idx + 1);
    renderAll();
  });
  document.getElementById("btn-add-unit").addEventListener("click", () => {
    commitForm();
    wb.units.push(blankUnit(`u${String(wb.units.length + 1).padStart(3, "0")}`));
    idx = wb.units.length - 1;
    scheduleSave();
    renderAll();
  });
  document.getElementById("btn-del-unit").addEventListener("click", () => {
    if (wb.units.length <= 1) return;
    if (!confirm("Удалить текущий блок?")) return;
    wb.units.splice(idx, 1);
    idx = Math.min(idx, wb.units.length - 1);
    scheduleSave();
    renderAll();
  });
  document.getElementById("btn-add-phrase").addEventListener("click", () => {
    const u = current();
    if (!u) return;
    u.phrases = u.phrases || [];
    u.phrases.push({ ru: "", ing: "" });
    scheduleSave();
    renderUnit();
  });
  document.getElementById("btn-add-word").addEventListener("click", () => {
    const u = current();
    if (!u) return;
    u.words = u.words || [];
    u.words.push({ ru: "", ing: "", pos: "", note: "" });
    scheduleSave();
    renderUnit();
  });
  document.getElementById("btn-phrase-sel").addEventListener("click", addPhraseFromSelection);
  document.getElementById("btn-split-ing").addEventListener("click", splitIngToUnits);
  document.getElementById("btn-split-current").addEventListener("click", splitCurrentUnit);
  document.getElementById("btn-suggest-words").addEventListener("click", suggestWordsFromIng);
  document.getElementById("btn-dict").addEventListener("click", lookupDict);
  els.dictQ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookupDict();
  });
  document.getElementById("btn-save-ls").addEventListener("click", () => {
    commitForm();
    localStorage.setItem(LS_KEY, JSON.stringify(wb));
    alert("Сохранено в браузере");
  });
  document.getElementById("btn-download-wb").addEventListener("click", () => {
    commitForm();
    downloadJson(wb, `${wb.storyId || "draft"}.workbench.json`);
  });
  document.getElementById("btn-export-story").addEventListener("click", exportCorpusStory);
  document.getElementById("btn-export-phrases").addEventListener("click", exportPhrases);
  document.getElementById("btn-load-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json.units)) {
        wb = json;
        wb.direction = "ing→ru";
      } else if (Array.isArray(json.paragraphs)) {
        wb = {
          ...emptyWorkbench(),
          storyId: json.id || "story_import",
          title: json.title || "Import",
          titleIng: json.titleIng || "",
          level: json.level || "B1",
          genre: json.genre || "novella",
          authorRu: json.authorRu || "",
          source: json.source || "import",
          note: json.note || "",
          units: json.paragraphs.map((p, i) => ({
            id: p.unitId || `u${String(i + 1).padStart(3, "0")}`,
            status: p.status || "draft",
            ru: p.ru || "",
            ing: p.ing || "",
            phrases: p.phrases || [],
            words: p.words || [],
            notes: p.notes || "",
          })),
        };
      } else {
        throw new Error("Нужен .workbench.json или story с paragraphs");
      }
      idx = 0;
      scheduleSave();
      renderAll();
    } catch (err) {
      alert(err.message || String(err));
    }
    e.target.value = "";
  });
  document.getElementById("btn-load-beki").addEventListener("click", async () => {
    try {
      const res = await fetch("/tools/seed/synovya-beki.workbench.json");
      if (!res.ok) throw new Error("seed not found");
      wb = await res.json();
      wb.direction = "ing→ru";
      idx = 0;
      scheduleSave();
      renderAll();
    } catch {
      alert("Не удалось загрузить seed. Открой файл через «Загрузить».");
    }
  });

  els.apiBase.value = API;
  els.apiBase.addEventListener("change", () => {
    localStorage.setItem("alignApiBase", els.apiBase.value.trim());
  });

  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      wb = JSON.parse(cached);
      wb.direction = "ing→ru";
    }
  } catch {
    /* ignore */
  }
  renderAll();
})();
