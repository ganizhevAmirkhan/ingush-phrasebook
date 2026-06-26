const TOKEN_KEY = "languageApiAdminToken";

const STAT_ICONS = {
  index: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  habar: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>`,
  book: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  grammar: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  corpus: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  term: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  block: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
};

function statCard(label, value, { icon = "book", tone = "indigo", sub = "" } = {}) {
  const svg = STAT_ICONS[icon] || STAT_ICONS.book;
  const subHtml = sub ? `<span class="stat-sub">${sub}</span>` : "";
  return `
    <div class="stat-card">
      <div class="stat-icon ${tone}" aria-hidden="true">${svg}</div>
      <div class="stat-body">
        <span class="stat-label">${label}</span>
        <strong>${value ?? 0}</strong>
        ${subHtml}
      </div>
    </div>`;
}

function sourceStep(num, title, meta) {
  return `
    <div class="source-step">
      <span class="source-step-num">${num}</span>
      <div class="source-step-body">
        ${title}
        ${meta ? `<div class="source-step-meta">${meta}</div>` : ""}
      </div>
    </div>`;
}

function apiBase() {
  return `${location.origin}/admin/api`;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(v) {
  if (v) localStorage.setItem(TOKEN_KEY, v);
  else localStorage.removeItem(TOKEN_KEY);
}

function toast(msg, ok = true) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error", !ok);
  el.classList.remove("hidden");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.add("hidden"), 2500);
}

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken("");
    showLogin();
    throw new Error("unauthorized");
  }
  return { ok: res.ok, status: res.status, json };
}

function showLogin() {
  document.getElementById("login-screen")?.classList.remove("hidden");
  document.getElementById("app")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("login-screen")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  document.getElementById("api-base").textContent = location.origin;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`panel-${name}`)?.classList.remove("hidden");
  if (name === "overview") loadOverview();
  if (name === "patterns") loadPatterns();
  if (name === "lexemes") {
    lexemesPageSize = SHOW_ALL_LIMIT;
    lexemesOffset = 0;
    loadLexemes();
  }
  if (name === "corpus") loadCorpus();
  if (name === "blacklist") loadBlacklist();
}

async function checkSession() {
  const { json } = await api("/session");
  const hint = document.getElementById("login-hint");
  if (!json.adminEnabled) {
    if (hint) {
      hint.textContent = "На VPS задайте ADMIN_SECRET в .env и перезапустите pm2.";
    }
    return false;
  }
  if (hint) hint.textContent = "";
  return json.authorized;
}

async function login() {
  const token = document.getElementById("admin-token")?.value.trim();
  if (!token) return toast("Введите пароль", false);
  setToken(token);
  const ok = await checkSession();
  if (!ok) {
    setToken("");
    toast("Неверный пароль", false);
    return;
  }
  showApp();
  switchTab("overview");
  toast("Вход выполнен ✓");
}

async function loadOverview() {
  const { json } = await api("/inventory");
  const inv = json.inventory || {};
  const m = json.metrics || {};
  const c = m.current || {};
  const grid = document.getElementById("stats-grid");
  if (grid) {
    const cards = [
      statCard("Индекс фраз (ключи)", c.phraseIndexKeys, { icon: "index", tone: "indigo" }),
      statCard("Habar (GitHub)", c.habarItemsRaw, { icon: "habar", tone: "sky" }),
      statCard("basic_phrases", `${c.habarBasicPhrasesLoaded ?? 0}`, {
        icon: "habar",
        tone: "sky",
        sub: `${c.habarBasicRaw ?? 0} в файлах → в индексе`
      }),
      statCard("conversation", `${c.habarConversationLoaded ?? 0}`, {
        icon: "habar",
        tone: "sky",
        sub: `${c.habarConversationRaw ?? 0} в файлах → в индексе`
      }),
      statCard("PaydaDosh", c.paydadoshRaw ?? c.paydaDoshPhrasesLoaded, { icon: "book", tone: "emerald" }),
      statCard("PaydaDosh everyday", c.paydadoshEverydayRaw ?? c.paydaDoshEverydayLoaded, { icon: "book", tone: "emerald" }),
      statCard("PaydaDosh уроки", c.paydadoshLessonRaw ?? c.paydaDoshLessonLoaded, { icon: "book", tone: "emerald" }),
      statCard("Словарь dosh", c.wordsLoaded, { icon: "book", tone: "violet" }),
      statCard("Шаблоны грамматики", inv.patterns, { icon: "grammar", tone: "amber" }),
      statCard("Лексемы", inv.lexemes, { icon: "grammar", tone: "amber" }),
      statCard("Классы (ва/я/ба/да)", inv.nounClassEntries ?? 0, {
        icon: "grammar",
        tone: "amber",
        sub: inv.nicholsUniqueStats
          ? `Nichols +${inv.nicholsUniqueStats.nounClassNewToApi ?? 0} без дублей`
          : "noun-class-knowledge"
      }),
      statCard("Nichols 2011", inv.nicholsGrammarSections ?? 0, {
        icon: "book",
        tone: "slate",
        sub: `${inv.nicholsPriorityChapters ?? 0} конспектов · ${inv.nicholsNumeralParadigms ?? 0} парадигм числ.`
      }),
      statCard("Дешериев 1999", inv.desheriev99Sections ?? 0, {
        icon: "book",
        tone: "slate",
        sub: "числит. · 9 спряж. · залоги"
      }),
      statCard("НАЬНА МОТТ", inv.naanaMottStats?.entriesNew ?? 0, {
        icon: "term",
        tone: "violet",
        sub: `OK.ru · ${inv.naanaMottSections ?? 0} разд. · ${inv.naanaMottStats?.corrections ?? 0} оговорок`
      }),
      statCard("Конспект грамматики", inv.grammarOverviewSections ?? 0, {
        icon: "grammar",
        tone: "slate",
        sub: "docx overview"
      }),
      statCard("Корпус (файлов)", c.corpusLoaded, { icon: "corpus", tone: "rose" }),
      statCard("Паралл. корпус", c.parallelCorpusInIndex ?? 0, {
        icon: "corpus",
        tone: "rose",
        sub: `${c.parallelCorpusPhrasesRaw ?? 0} сырых фраз`
      }),
      statCard("Словарь терминов", c.ingTermPhrasesLoaded ?? 0, {
        icon: "term",
        tone: "violet",
        sub: `${c.ingTermRaw ?? 0} терминов, ${c.ingTermWordsLoaded ?? 0} слов`
      }),
      statCard("Corpus уроки", c.corpusPhrasesInIndex ?? 0, {
        icon: "corpus",
        tone: "slate",
        sub: `${c.corpusPhrasesRaw ?? 0} сырых`
      }),
      statCard("Чёрный список", inv.blacklist, { icon: "block", tone: "slate" })
    ];
    grid.innerHTML = cards.join("");
  }

  const sourcesBox = document.getElementById("sources-box");
  if (sourcesBox) {
    sourcesBox.innerHTML = `
      <div class="info-box-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Источники перевода <span class="muted">(порядок /translate)</span>
      </div>
      <div class="source-pipeline">
        ${sourceStep("1", "<b>habar</b> — разговорник с GitHub", `${c.habarPhrasesLoaded ?? 0} фраз · ${c.phraseIndexKeys ?? 0} ключей в индексе`)}
        ${sourceStep("2", "<b>paydadosh</b> — PaydaDosh", `${c.paydaDoshPhrasesLoaded ?? 0} фраз (everyday ${c.paydaDoshEverydayLoaded ?? 0}, уроки ${c.paydaDoshLessonLoaded ?? 0})`)}
        ${sourceStep("2b", "<b>corpus</b> — параллельные тексты ghalghay", `${c.parallelCorpusInIndex ?? 0} фраз · Киплинг, Пушкин…`)}
        ${sourceStep("2c", "<b>ing_term</b> — словарь терминов 2016", `${c.ingTermPhrasesLoaded ?? 0} в индексе · ${c.ingTermWordsLoaded ?? 0} слов`)}
        ${sourceStep("3", "<b>grammar</b> — шаблоны + лексемы + классы", `${inv.patterns ?? 0} шаблонов · ${inv.lexemes ?? 0} лексем · ${inv.nounClassEntries ?? 0} классов`)}
        ${sourceStep("3b", "<b>nichols</b> — справочник (829 стр., без дублей)", `${inv.nicholsGrammarSections ?? 0} глав · ${inv.nicholsUniqueStats?.nounClassNewToApi ?? 52} слов класса · ${inv.nicholsNumeralParadigms ?? 4} склон. числ.`)}
        ${sourceStep("3c", "<b>desheriev</b> — энциклопедия 1999", `${inv.desheriev99Sections ?? 0} разделов · числит. -лагӀа · залоги`)}
        ${sourceStep("3d", "<b>naana_mott</b> — OK.ru редкая лексика", `${inv.naanaMottStats?.entriesNew ?? 0} новых · ${inv.naanaMottStats?.corrections ?? 0} оговорок`)}
        ${sourceStep("4", "<b>dosh</b> — словарь + сборка из слов", `${c.wordsLoaded ?? 0} слов`)}
        ${sourceStep("5", "<b>LLM</b> — OpenRouter / Gemini", "fallback, если ничего не найдено")}
      </div>
      <div class="info-footnote">
        Формат «N → M в индексе»: N — фраз в файлах, M — после слияния (дубликаты отбрасываются).<br>
        После push Habar: <b>POST /refresh</b> с <code>{"pullCategories":true}</code> или кнопка «Перезагрузить данные».
      </div>`;
  }

  const geminiBox = document.getElementById("gemini-box");
  if (geminiBox) {
    try {
      const res = await fetch(`${location.origin}/health/llm`, { cache: "no-store" });
      const g = await res.json();
      if (g.ok) {
        const provider = g.provider === "openrouter" ? "OpenRouter" : "Gemini";
        const model = g.model ? g.model : "";
        geminiBox.innerHTML = `
          <div class="llm-status">
            <span class="llm-dot" aria-hidden="true"></span>
            <div class="llm-text">
              <strong>LLM работает</strong>
              <small>${provider}${model ? ` · ${model}` : ""}</small>
            </div>
          </div>`;
      } else {
        const parts = [];
        if (g.openrouterConfigured) parts.push("OpenRouter настроен, но не отвечает");
        if (g.geminiConfigured) parts.push("Gemini настроен, но не отвечает");
        if (!g.openrouterConfigured && !g.geminiConfigured) {
          parts.push("Нет OPENROUTER_API_KEY / GEMINI_API_KEY в .env");
        }
        geminiBox.innerHTML = `
          <div class="llm-status">
            <span class="llm-dot error" aria-hidden="true"></span>
            <div class="llm-text">
              <strong>LLM недоступен</strong>
              <small>${g.error || "ошибка"}${parts.length ? ` · ${parts.join("; ")}` : ""}${g.detail ? ` · ${g.detail}` : ""}</small>
            </div>
          </div>`;
      }
    } catch {
      geminiBox.innerHTML = `
        <div class="llm-status">
          <span class="llm-dot error" aria-hidden="true"></span>
          <div class="llm-text"><strong>Не удалось проверить LLM</strong></div>
        </div>`;
    }
  }
}

function renderList(el, items, activeKey, onClick, labelFn) {
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="list-item muted">Ничего не найдено</div>`;
    return;
  }
  el.innerHTML = items.map((item) => {
    const key = labelFn.key(item);
    const active = key === activeKey ? " active" : "";
    return `<div class="list-item${active}" data-key="${encodeURIComponent(key)}">${labelFn.title(item)}<small>${labelFn.sub(item)}</small></div>`;
  }).join("");
  el.querySelectorAll(".list-item[data-key]").forEach((node) => {
    node.addEventListener("click", () => onClick(decodeURIComponent(node.dataset.key)));
  });
}

const PAGE_SIZE = 100;
const SHOW_ALL_LIMIT = 5000;

function updateListMeta(metaId, total, offset, shown) {
  const el = document.getElementById(metaId);
  if (!el) return;
  if (!total) {
    el.textContent = "Ничего не найдено";
    return;
  }
  const from = offset + 1;
  const to = offset + shown;
  el.textContent = `Всего: ${total} · на экране ${from}–${to}`;
}

function setPagerButtons(prevId, nextId, pageId, offset, total, pageSize) {
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  const page = document.getElementById(pageId);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pages, Math.floor(offset / pageSize) + 1);
  if (prev) prev.disabled = offset <= 0;
  if (next) next.disabled = offset + pageSize >= total;
  if (page) page.textContent = `${current} / ${pages}`;
}

let patternsActive = "";
let patternsOffset = 0;
let patternsPageSize = PAGE_SIZE;

async function loadPatterns() {
  const q = document.getElementById("patterns-search")?.value.trim() || "";
  const { json } = await api(`/grammar/patterns?q=${encodeURIComponent(q)}&limit=${patternsPageSize}&offset=${patternsOffset}`);
  const total = json.total || 0;
  const items = json.items || [];
  updateListMeta("patterns-meta", total, patternsOffset, items.length);
  setPagerButtons("patterns-prev", "patterns-next", "patterns-page", patternsOffset, total, patternsPageSize);
  renderList(
    document.getElementById("patterns-list"),
    json.items || [],
    patternsActive,
    loadPatternEditor,
    {
      key: (x) => x.id,
      title: (x) => x.ruPattern,
      sub: (x) => `${x.id} · ${x.ingTemplate}`
    }
  );
}

async function loadPatternEditor(id) {
  patternsActive = id;
  loadPatterns();
  const { json } = await api(`/grammar/patterns/${encodeURIComponent(id)}`);
  const f = document.getElementById("pattern-form");
  if (!f || !json.item) return;
  f.id.value = json.item.id;
  f.ruPattern.value = json.item.ruPattern || "";
  f.ingTemplate.value = json.item.ingTemplate || "";
  f.description.value = json.item.description || "";
  f.priority.value = json.item.priority ?? 50;
  f.slots.value = JSON.stringify(json.item.slots || [], null, 2);
  f.examples.value = JSON.stringify(json.item.examples || [], null, 2);
}

function newPattern() {
  patternsActive = "";
  const f = document.getElementById("pattern-form");
  if (!f) return;
  f.reset();
  f.priority.value = 50;
  f.slots.value = '[{"name":"X","pos":"noun","requiredCase":"base"}]';
  f.examples.value = '[{"ru":"","ing_expected":""}]';
  loadPatterns();
}

async function savePattern(ev) {
  ev.preventDefault();
  const f = ev.target;
  let slots;
  let examples;
  try {
    slots = JSON.parse(f.slots.value);
    examples = JSON.parse(f.examples.value);
  } catch {
    return toast("Неверный JSON в slots/examples", false);
  }
  const body = {
    id: f.id.value.trim(),
    ruPattern: f.ruPattern.value.trim(),
    ingTemplate: f.ingTemplate.value.trim(),
    description: f.description.value.trim(),
    priority: Number(f.priority.value) || 50,
    slots,
    examples
  };
  const { json, ok } = await api("/grammar/patterns", { method: "POST", body });
  toast(ok ? "Шаблон сохранён ✓" : (json.message || json.error || "Ошибка"), ok);
  if (ok) {
    patternsActive = body.id;
    loadPatterns();
  }
}

async function deletePattern() {
  const id = document.getElementById("pattern-form")?.id?.value.trim();
  if (!id || !confirm(`Удалить шаблон ${id}?`)) return;
  const { ok } = await api(`/grammar/patterns?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  toast(ok ? "Удалено" : "Ошибка", ok);
  if (ok) newPattern();
}

let lexemeActive = "";
let lexemesOffset = 0;
let lexemesPageSize = PAGE_SIZE;

async function loadLexemes() {
  const q = document.getElementById("lexemes-search")?.value.trim() || "";
  const { json } = await api(`/grammar/lexemes?q=${encodeURIComponent(q)}&limit=${lexemesPageSize}&offset=${lexemesOffset}`);
  const total = json.total || 0;
  const items = json.items || [];
  updateListMeta("lexemes-meta", total, lexemesOffset, items.length);
  setPagerButtons("lexemes-prev", "lexemes-next", "lexemes-page", lexemesOffset, total, lexemesPageSize);
  renderList(
    document.getElementById("lexemes-list"),
    items,
    lexemeActive,
    loadLexemeEditor,
    {
      key: (x) => x.ru,
      title: (x) => x.ru,
      sub: (x) => `${x.forms?.base || ""} · ${x.pos || ""}`
    }
  );
}

async function loadLexemeEditor(ru) {
  lexemeActive = ru;
  loadLexemes();
  const { json } = await api(`/grammar/lexemes/${encodeURIComponent(ru)}`);
  const f = document.getElementById("lexeme-form");
  if (!f || !json.item) return;
  f.ru.value = json.item.ru;
  f.pos.value = json.item.pos || "noun";
  f.forms.value = JSON.stringify(json.item.forms || {}, null, 2);
  f.notes.value = json.item.notes || "";
}

function newLexeme() {
  lexemeActive = "";
  const f = document.getElementById("lexeme-form");
  if (!f) return;
  f.reset();
  f.pos.value = "noun";
  f.forms.value = '{"base":"","dat":""}';
  loadLexemes();
}

async function saveLexeme(ev) {
  ev.preventDefault();
  const f = ev.target;
  let forms;
  try {
    forms = JSON.parse(f.forms.value);
  } catch {
    return toast("Неверный JSON в forms", false);
  }
  const body = {
    ru: f.ru.value.trim(),
    pos: f.pos.value.trim(),
    forms,
    notes: f.notes.value.trim()
  };
  const { ok, json } = await api("/grammar/lexemes", { method: "POST", body });
  toast(ok ? "Лексема сохранена ✓" : (json.error || "Ошибка"), ok);
  if (ok) {
    lexemeActive = body.ru;
    loadLexemes();
  }
}

async function deleteLexeme() {
  const ru = document.getElementById("lexeme-form")?.ru?.value.trim();
  if (!ru || !confirm(`Удалить лексему «${ru}»?`)) return;
  const { ok } = await api(`/grammar/lexemes?ru=${encodeURIComponent(ru)}`, { method: "DELETE" });
  toast(ok ? "Удалено" : "Ошибка", ok);
  if (ok) newLexeme();
}

let corpusActive = "";

async function loadCorpus() {
  const q = document.getElementById("corpus-search")?.value.trim() || "";
  const genre = document.getElementById("corpus-genre")?.value || "";
  const { json } = await api(`/corpus?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}&limit=80`);
  renderList(
    document.getElementById("corpus-list"),
    json.items || [],
    corpusActive,
    loadCorpusEditor,
    {
      key: (x) => x.id,
      title: (x) => x.title,
      sub: (x) => `${x.genre} · ${x.paragraphCount} реплик`
    }
  );
}

async function loadCorpusEditor(id) {
  corpusActive = id;
  loadCorpus();
  const { json } = await api(`/corpus/${encodeURIComponent(id)}`);
  const f = document.getElementById("corpus-form");
  if (!f || !json.item) return;
  f.id.value = json.item.id;
  f.title.value = json.item.title || "";
  f.level.value = json.item.level || "A1";
  f.genre.value = json.item.genre || "dialogue";
  f.paragraphs.value = JSON.stringify(json.item.paragraphs || [], null, 2);
  f.glossary.value = JSON.stringify(json.item.glossary || [], null, 2);
}

function newCorpus() {
  corpusActive = "";
  const f = document.getElementById("corpus-form");
  if (!f) return;
  f.reset();
  f.level.value = "A1";
  f.genre.value = "dialogue";
  f.id.value = `story_${Date.now()}`;
  f.paragraphs.value = '[{"ru":"","ing":""}]';
  f.glossary.value = "[]";
  loadCorpus();
}

async function saveCorpus(ev) {
  ev.preventDefault();
  const f = ev.target;
  let paragraphs;
  let glossary;
  try {
    paragraphs = JSON.parse(f.paragraphs.value);
    glossary = JSON.parse(f.glossary.value || "[]");
  } catch {
    return toast("Неверный JSON", false);
  }
  const body = {
    id: f.id.value.trim(),
    title: f.title.value.trim(),
    level: f.level.value.trim(),
    genre: f.genre.value,
    paragraphs,
    glossary
  };
  const { ok, json } = await api("/corpus", { method: "POST", body });
  toast(ok ? "Текст сохранён ✓" : (json.error || "Ошибка"), ok);
  if (ok) {
    corpusActive = body.id;
    loadCorpus();
  }
}

async function deleteCorpus() {
  const id = document.getElementById("corpus-form")?.id?.value.trim();
  if (!id || !confirm(`Удалить текст ${id}?`)) return;
  const { ok } = await api(`/corpus?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  toast(ok ? "Удалено" : "Ошибка", ok);
  if (ok) newCorpus();
}

async function uploadCorpusFile(file) {
  const text = await file.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return toast("Файл не JSON", false);
  }
  const { ok, json } = await api("/corpus", { method: "POST", body: doc });
  toast(ok ? `Загружено: ${doc.title || doc.id}` : (json.error || "Ошибка"), ok);
  if (ok) {
    corpusActive = doc.id;
    loadCorpus();
    loadCorpusEditor(doc.id);
  }
}

async function loadBlacklist() {
  const { json } = await api("/blacklist");
  const ul = document.getElementById("blacklist-list");
  if (!ul) return;
  const blocked = json.blocked || [];
  ul.innerHTML = blocked.map((term) => `
    <li>${term} <button type="button" data-term="${term}">✕</button></li>
  `).join("");
  ul.querySelectorAll("button[data-term]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const term = btn.dataset.term;
      const { ok } = await api(`/blacklist?term=${encodeURIComponent(term)}`, { method: "DELETE" });
      toast(ok ? "Удалено" : "Ошибка", ok);
      if (ok) loadBlacklist();
    });
  });
}

async function addBlacklistTerm() {
  const input = document.getElementById("blacklist-term");
  const term = input?.value.trim();
  if (!term) return;
  const { ok, json } = await api("/blacklist", { method: "POST", body: { term } });
  if (!ok && json?.error === "protected_term") {
    toast(json.detail || "Это слово нельзя блокировать", false);
    return;
  }
  toast(ok ? "Добавлено ✓" : "Ошибка", ok);
  if (ok) {
    input.value = "";
    loadBlacklist();
  }
}

async function runTranslateTest() {
  const ru = document.getElementById("test-ru")?.value.trim();
  const out = document.getElementById("test-result");
  if (!ru) return;
  if (out) out.textContent = "…";
  const { json, ok } = await api("/translate-test", { method: "POST", body: { ru } });
  if (!out) return;
  if (ok) {
    out.textContent = `✓ ${json.translation}\nИсточник: ${json.usedSource}\nУверенность: ${json.confidence}`;
  } else if ((json.error || "").startsWith("blocked_form:")) {
    const form = (json.error || "").slice("blocked_form:".length);
    out.textContent =
      `✗ LLM предложил форму с «${form}», сработал чёрный список.\n` +
      `Проверьте опечатку в русском (напр. «спать», не «чпать») — тогда ответ из Habar без LLM.\n` +
      `В админке → Чёрный список: уберите «хьоб»/«хьо», если добавляли — это нормальный ингушский.\n` +
      `${json.detail || ""}`;
  } else {
    out.textContent = `✗ ${json.error || "ошибка"}\n${json.detail || ""}`;
  }
}

async function reloadData() {
  const { ok } = await api("/reload", { method: "POST" });
  toast(ok ? "Данные перезагружены ✓" : "Ошибка", ok);
  loadOverview();
}

function bindEvents() {
  document.getElementById("btn-login")?.addEventListener("click", login);
  document.getElementById("admin-token")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    setToken("");
    showLogin();
  });
  document.getElementById("btn-reload")?.addEventListener("click", reloadData);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("patterns-search")?.addEventListener("input", () => { patternsOffset = 0; patternsPageSize = PAGE_SIZE; loadPatterns(); });
  document.getElementById("patterns-prev")?.addEventListener("click", () => {
    patternsOffset = Math.max(0, patternsOffset - patternsPageSize);
    loadPatterns();
  });
  document.getElementById("patterns-next")?.addEventListener("click", () => {
    patternsOffset += patternsPageSize;
    loadPatterns();
  });
  document.getElementById("patterns-all")?.addEventListener("click", () => {
    patternsPageSize = SHOW_ALL_LIMIT;
    patternsOffset = 0;
    loadPatterns();
  });
  document.getElementById("patterns-new")?.addEventListener("click", newPattern);
  document.getElementById("pattern-form")?.addEventListener("submit", savePattern);
  document.getElementById("pattern-delete")?.addEventListener("click", deletePattern);

  document.getElementById("lexemes-search")?.addEventListener("input", () => { lexemesOffset = 0; lexemesPageSize = PAGE_SIZE; loadLexemes(); });
  document.getElementById("lexemes-prev")?.addEventListener("click", () => {
    lexemesOffset = Math.max(0, lexemesOffset - lexemesPageSize);
    loadLexemes();
  });
  document.getElementById("lexemes-next")?.addEventListener("click", () => {
    lexemesOffset += lexemesPageSize;
    loadLexemes();
  });
  document.getElementById("lexemes-all")?.addEventListener("click", () => {
    lexemesPageSize = SHOW_ALL_LIMIT;
    lexemesOffset = 0;
    loadLexemes();
  });
  document.getElementById("lexemes-new")?.addEventListener("click", newLexeme);
  document.getElementById("lexeme-form")?.addEventListener("submit", saveLexeme);
  document.getElementById("lexeme-delete")?.addEventListener("click", deleteLexeme);

  document.getElementById("corpus-search")?.addEventListener("input", () => loadCorpus());
  document.getElementById("corpus-genre")?.addEventListener("change", () => loadCorpus());
  document.getElementById("corpus-new")?.addEventListener("click", newCorpus);
  document.getElementById("corpus-form")?.addEventListener("submit", saveCorpus);
  document.getElementById("corpus-delete")?.addEventListener("click", deleteCorpus);
  document.getElementById("corpus-upload")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadCorpusFile(file);
    e.target.value = "";
  });

  document.getElementById("blacklist-add")?.addEventListener("click", addBlacklistTerm);
  document.getElementById("test-run")?.addEventListener("click", runTranslateTest);
}

async function init() {
  bindEvents();
  const sessionOk = await checkSession();
  if (getToken() && sessionOk) {
    showApp();
    switchTab("overview");
  } else {
    showLogin();
  }
}

init();
