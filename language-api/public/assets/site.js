const ORIGIN = location.origin;

const ENDPOINTS = [
  {
    method: "POST",
    path: "/translate",
    desc: "Гибридный RU → ING",
    body: '{\n  "ru": "Я хочу пить"\n}',
    note: "grammar → база → LLM · ответ: usedSource, confidence"
  },
  {
    method: "POST",
    path: "/ai/assist",
    desc: "ИИ-задачи",
    body: '{\n  "task": "fix_ru",\n  "text": "…"\n}',
    note: "make_pron, fix_ru и др."
  },
  {
    method: "GET",
    path: "/lookup/word?ru=вода",
    desc: "База знаний: dosh",
    body: null
  },
  {
    method: "GET",
    path: "/lookup/phrase?ru=Добрый день",
    desc: "База: фразы",
    body: null
  },
  {
    method: "GET",
    path: "/lookup/corpus?q=горы",
    desc: "База: корпус",
    body: null
  },
  {
    method: "GET",
    path: "/metrics",
    desc: "Метрики движка",
    body: null
  },
  {
    method: "GET",
    path: "/health",
    desc: "Статус + LLM",
    body: null
  },
  {
    method: "GET",
    path: "/info",
    desc: "О платформе",
    body: null
  }
];

const STAT_CARDS = [
  { key: "phraseIndexKeys", label: "Ключей в индексе" },
  { key: "habarPhrasesLoaded", label: "Habar" },
  { key: "paydaDoshPhrasesLoaded", label: "PaydaDosh" },
  { key: "parallelCorpusInIndex", label: "Паралл. корпус" },
  { key: "wordsLoaded", label: "Слов dosh" },
  { key: "grammarPatternsLoaded", label: "Шаблонов" },
  { key: "grammarLexemesLoaded", label: "Лексем" },
  { key: "nounClassEntriesLoaded", label: "Классов (ва/я/ба/да)" },
  { key: "corpusLoaded", label: "Файлов corpus" }
];

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("ru-RU");
}

async function fetchJson(path, opts) {
  const res = await fetch(`${ORIGIN}${path}`, { cache: "no-store", ...opts });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

function renderEndpoints() {
  const list = document.getElementById("endpoint-list");
  if (!list) return;
  list.innerHTML = ENDPOINTS.map((ep, i) => {
    const curl =
      ep.method === "GET"
        ? `curl "${ORIGIN}${ep.path}"`
        : `curl -X POST "${ORIGIN}${ep.path}" \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.body || "{}"}'`;
    return `
      <div class="endpoint" data-idx="${i}">
        <div class="endpoint-head" role="button" tabindex="0">
          <span class="method method-${ep.method.toLowerCase()}">${ep.method}</span>
          <span class="endpoint-path">${ep.path.split("?")[0]}</span>
          <span class="endpoint-desc">${ep.desc}</span>
        </div>
        <div class="endpoint-body">
          <pre class="code-block"><button type="button" class="copy-btn">Copy</button>${curl}</pre>
          ${ep.note ? `<p style="margin:8px 0 0;font-size:0.78rem;color:var(--muted)">${ep.note}</p>` : ""}
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".endpoint-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });

  list.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = btn.parentElement.textContent.replace("Copy", "").trim();
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "OK";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      });
    });
  });
}

function renderStats(c) {
  const grid = document.getElementById("stats-grid");
  if (!grid) return;
  grid.innerHTML = STAT_CARDS.map(({ key, label }) => {
    const val = c?.[key];
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${fmt(val)}</div></div>`;
  }).join("");

  document.querySelectorAll(".pipe-count[data-k]").forEach((el) => {
    const k = el.dataset.k;
    if (c?.[k] != null) el.textContent = fmt(c[k]);
  });
}

async function loadStatus() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const [{ ok: hOk, json: health }, { ok: mOk, json: metrics }] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/metrics")
  ]);

  if (hOk && metrics?.ok) {
    dot?.classList.add("ok");
    text.textContent = health.llmPrimary ? `online · ${health.llmPrimary}` : "online";
    renderStats(metrics.metrics?.current || {});
  } else {
    dot?.classList.add("warn");
    text.textContent = "offline";
  }
}

async function runTranslate() {
  const ru = document.getElementById("demo-ru")?.value.trim();
  const out = document.getElementById("demo-result");
  const meta = document.getElementById("demo-meta");
  if (!ru || !out) return;
  out.textContent = "…";
  meta.textContent = "";
  const { ok, json } = await fetchJson("/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ru })
  });
  if (!ok) {
    out.textContent = json.detail || json.error || "Ошибка";
    return;
  }
  out.textContent = json.translation || "—";
  meta.textContent = `слой: ${json.usedSource || "?"} · confidence: ${json.confidence ?? "—"}${json.fallbackUsed ? " · LLM augment" : ""}`;
}

async function runLookup() {
  const q = document.getElementById("lookup-q")?.value.trim();
  const out = document.getElementById("lookup-result");
  if (!q || !out) return;
  out.textContent = "…";
  const [w, p] = await Promise.all([
    fetchJson(`/lookup/word?ru=${encodeURIComponent(q)}`),
    fetchJson(`/lookup/phrase?ru=${encodeURIComponent(q)}`)
  ]);
  out.textContent = JSON.stringify(
    { word: w.json?.items?.slice(0, 5), phrase: p.json?.items?.slice(0, 3) },
    null,
    2
  );
}

document.getElementById("api-origin").textContent = ORIGIN;
document.getElementById("btn-translate")?.addEventListener("click", runTranslate);
document.getElementById("btn-lookup")?.addEventListener("click", runLookup);
document.getElementById("demo-ru")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runTranslate();
});

renderEndpoints();
loadStatus();
