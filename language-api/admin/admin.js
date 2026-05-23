const TOKEN_KEY = "languageApiAdminToken";

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
  if (name === "lexemes") loadLexemes();
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
      ["Шаблоны грамматики", inv.patterns],
      ["Лексемы", inv.lexemes],
      ["Правила слотов", inv.rules],
      ["Словарь dosh", c.wordsLoaded],
      ["PaydaDosh", c.paydaDoshPhrasesLoaded],
      ["Фразы уроков", c.lessonPhrasesLoaded],
      ["Корпус текстов", c.corpusLoaded],
      ["Чёрный список", inv.blacklist]
    ];
    grid.innerHTML = cards.map(([l, v]) => `
      <div class="stat-card"><span>${l}</span><strong>${v ?? 0}</strong></div>
    `).join("");
  }

  const sourcesBox = document.getElementById("sources-box");
  if (sourcesBox) {
    sourcesBox.innerHTML = `
      <strong>Источники перевода (порядок приоритета)</strong><br>
      1. <b>grammar</b> — шаблоны (${inv.patterns ?? 0}) + лексемы (${inv.lexemes ?? 0})<br>
      2. <b>dosh</b> — онлайн-словарь (${c.wordsLoaded ?? 0} слов)<br>
      3. <b>paydadosh</b> — разговорные фразы (${c.paydaDoshPhrasesLoaded ?? 0})<br>
      4. <b>corpus/lesson</b> — короткие фразы из уроков (${c.lessonPhrasesLoaded ?? 0})<br>
      5. <b>habar</b> — фразы разговорника (<i>сейчас выключены</i> в /translate)<br>
      6. <b>gemini</b> — LLM, если словарь не нашёл<br><br>
      <small>
        «Правила слотов» (${inv.rules ?? 0}) — это не шаблоны перевода, а технические правила падежей (base/dat/gen).<br>
        Реальные шаблоны — вкладка <b>Грамматика</b> (${inv.patterns ?? 0} шт.), поле <b>Приоритет</b> у каждого шаблона.
      </small>
    `;
  }

  const geminiBox = document.getElementById("gemini-box");
  if (geminiBox) {
    try {
      const res = await fetch(`${location.origin}/health/gemini`, { cache: "no-store" });
      const g = await res.json();
      geminiBox.innerHTML = g.ok
        ? `<strong>Gemini:</strong> работает ✓`
        : `<strong>Gemini:</strong> ${g.error || "ошибка"}<br><small>${g.detail || ""}</small>`;
    } catch {
      geminiBox.textContent = "Не удалось проверить Gemini";
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

let patternsActive = "";

async function loadPatterns() {
  const q = document.getElementById("patterns-search")?.value.trim() || "";
  const { json } = await api(`/grammar/patterns?q=${encodeURIComponent(q)}&limit=80`);
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

async function loadLexemes() {
  const q = document.getElementById("lexemes-search")?.value.trim() || "";
  const { json } = await api(`/grammar/lexemes?q=${encodeURIComponent(q)}&limit=80`);
  renderList(
    document.getElementById("lexemes-list"),
    json.items || [],
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
  const { ok } = await api("/blacklist", { method: "POST", body: { term } });
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

  document.getElementById("patterns-search")?.addEventListener("input", () => loadPatterns());
  document.getElementById("patterns-new")?.addEventListener("click", newPattern);
  document.getElementById("pattern-form")?.addEventListener("submit", savePattern);
  document.getElementById("pattern-delete")?.addEventListener("click", deletePattern);

  document.getElementById("lexemes-search")?.addEventListener("input", () => loadLexemes());
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
