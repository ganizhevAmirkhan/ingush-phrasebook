/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-phrasebook";
const BRANCH = "main";

/* ================= DATA ================= */
const categories = [
  "greetings","basic_phrases","personal_info","family","home",
  "food","drinks","travel","transport","hunting",
  "danger","thermal","orientation","weather","emotions",
  "health","help","commands","tools","animals",
  "time","numbers","colors","money","shop",
  "city","village","guests","communication","work","misc"
];

const categoryTitles = {
  greetings:"Приветствия", basic_phrases:"Базовые фразы",
  personal_info:"Личная информация", family:"Семья",
  home:"Дом", food:"Еда", drinks:"Напитки",
  travel:"Путешествия", transport:"Транспорт",
  hunting:"Охота", danger:"Опасность", thermal:"Тепловизор",
  orientation:"Ориентирование", weather:"Погода",
  emotions:"Эмоции", health:"Здоровье", help:"Помощь",
  commands:"Команды", tools:"Инструменты", animals:"Животные",
  time:"Время", numbers:"Числа", colors:"Цвета",
  money:"Деньги", shop:"Магазин", city:"Город",
  village:"Деревня", guests:"Гости", communication:"Общение",
  work:"Работа", misc:"Разное"
};

/* ================= STATE ================= */
let currentCategory = null;
let currentData = null;

let allPhrases = [];            // плоский список
let phraseIndex = {};           // id -> category
let currentView = "category";   // "category" | "search"
let searchResults = [];
let lastSearchQuery = "";

let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

/* --- Audio status cache --- */
let audioStatusById = {};       // id -> true/false (есть аудио?)
let showOnlyUnvoiced = false;   // фильтр "только без озвучки"

/* --- Modal edit/add state --- */
let editMode = null;            // "edit" | "add"
let editingItemId = null;       // id при редактировании
let editingCategory = null;     // cat при добавлении/редактировании

/* --- AI sources (dosh + habar) --- */
let dictionaryWords = [];

/* ================= UTILS ================= */
function genId(){
  return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
}
const safe = v => (v ?? "").toString();
const low  = v => safe(v).toLowerCase();

function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64){
  return decodeURIComponent(escape(atob(b64)));
}

function ensureToast(){
  let t = document.getElementById("toast");
  if(t) return t;
  t = document.createElement("div");
  t.id = "toast";
  t.className = "toast hidden";
  document.body.appendChild(t);
  return t;
}
function toast(msg, ok=true){
  const t = ensureToast();
  t.textContent = msg;
  t.classList.remove("hidden");
  t.classList.toggle("ok", !!ok);
  t.classList.toggle("bad", !ok);
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.add("hidden"), 1700);
}

/* ================= INIT ================= */
window.onload = async () => {
  loadCategories();
  await preloadAllCategories();
  await preloadDictionaryForAI();

  if(githubToken){
    adminMode = true;
    setAdminUI(true);
  }

  setupSearchSuggest();
  initAiUI();

  // Если у тебя где-то был кэш старого режима — просто перерисуем
  renderCurrentView();
};

/* ================= CATEGORY LIST ================= */
function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  categories.forEach(cat=>{
    const el = document.createElement("div");
    el.className = "category";
    el.textContent = categoryTitles[cat];
    el.onclick = () => loadCategory(cat);
    list.appendChild(el);
  });
}

async function loadCategory(cat){
  currentView = "category";
  currentCategory = cat;
  document.getElementById("content-title").textContent = categoryTitles[cat];

  const r = await fetch(`categories/${cat}.json`);
  currentData = await r.json();

  migrateItems(currentData);

  // пересканим аудио для текущей категории
  await scanAudioForItems(currentData.items.map(it => ({...it, category: cat})));

  renderCategory();
}

/* ================= MIGRATION ================= */
function migrateItems(data){
  let changed = false;
  data.items.forEach(it=>{
    if(!it.id){
      it.id = genId();
      changed = true;
    }
    if(!it.audio || !/\.(mp3|webm)$/i.test(it.audio)){
      it.audio = `${it.id}.mp3`;
      changed = true;
    }
  });
  return changed;
}

async function migrateAllCategories(){
  if(!confirm("Зафиксировать id и audio=id.mp3 во всех категориях?")) return;

  for(const cat of categories){
    const d = await loadCategoryData(cat);
    const changed = migrateItems(d);
    if(changed){
      await saveCategoryData(cat, d);
    }
  }

  alert("Миграция завершена. Страница перезагрузится.");
  location.reload();
}

/* ================= AUDIO STATUS SCAN ================= */
async function headOk(url){
  try{
    const r = await fetch(url, { method:"HEAD" });
    return !!r.ok;
  }catch{
    return false;
  }
}

async function hasAudio(cat, file){
  const base = (file || "").replace(/\.(mp3|webm)$/i, "");
  const variants = [`${base}.mp3`, `${base}.webm`];

  for(const f of variants){
    const ok = await headOk(`audio/${cat}/${f}`);
    if(ok) return true;
  }
  return false;
}

// простая очередь, чтобы не делать 300 HEAD одновременно
async function scanAudioForItems(items){
  const queue = items.slice();
  const workers = [];
  const concurrency = 10;

  async function worker(){
    while(queue.length){
      const it = queue.shift();
      if(!it || !it.id) continue;
      const file = it.audio || `${it.id}.mp3`;
      const ok = await hasAudio(it.category, file);
      audioStatusById[it.id] = ok;
    }
  }

  for(let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);

  updateUnvoicedStats();
}

function updateUnvoicedStats(){
  const box = document.getElementById("unvoiced-stats");
  if(!box) return;

  const items = getCurrentItemsForView();
  const total = items.length;
  const unvoiced = items.filter(it => audioStatusById[it.id] === false).length;

  box.textContent = `Без озвучки: ${unvoiced} / ${total}`;
}

function getCurrentItemsForView(){
  if(currentView === "search"){
    return searchResults || [];
  }
  if(currentView === "category" && currentData?.items && currentCategory){
    return currentData.items.map(it => ({...it, category: currentCategory}));
  }
  return [];
}

/* ================= RENDER ================= */
function renderPhrase(item){
  const file = item.audio || `${item.id}.mp3`;

  const has = audioStatusById[item.id] === true;
  const dot = has ? "🟢" : "⚪";
  const disabled = has ? "" : "disabled";

  return `
  <div class="phrase" id="ph-${item.id}">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>
    <i>${categoryTitles[item.category]}</i><br>

    <button id="pb-${item.id}" class="play-btn" ${disabled}
      onclick="playAudio('${item.category}','${file}','${item.id}')">▶</button>
    <span id="ai-${item.id}">${dot}</span>

    ${adminMode ? `
      <button class="icon-btn" onclick="recordById('${item.id}')">🎤</button>
      <button class="icon-btn" onclick="editById('${item.id}')">✏</button>
      <button class="icon-btn" onclick="deleteById('${item.id}')">🗑</button>
    ` : ""}
  </div>`;
}

function renderToolbar(container){
  // панель над списком фраз
  const bar = document.createElement("div");
  bar.className = "toolrow";

  const stats = document.createElement("span");
  stats.id = "unvoiced-stats";
  stats.className = "stat";
  stats.textContent = "Без озвучки: ...";

  const btnFilter = document.createElement("button");
  btnFilter.className = "btn btn-ghost";
  btnFilter.textContent = showOnlyUnvoiced ? "Показать все" : "Показать только без озвучки";
  btnFilter.onclick = async () => {
    showOnlyUnvoiced = !showOnlyUnvoiced;
    renderCurrentView();
  };

  const btnNext = document.createElement("button");
  btnNext.className = "btn btn-ghost";
  btnNext.textContent = "➡ Следующая без озвучки";
  btnNext.onclick = () => goToNextUnvoiced();

  bar.appendChild(stats);
  bar.appendChild(btnFilter);
  bar.appendChild(btnNext);

  container.appendChild(bar);

  updateUnvoicedStats();
}

function renderCategory(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  if(!currentData || !Array.isArray(currentData.items)){
    c.innerHTML = "<p>Данные категории ещё не загружены. Выберите категорию повторно.</p>";
    return;
  }

  // toolbar
  renderToolbar(c);

  if(adminMode){
    const m = document.createElement("button");
    m.className = "btn btn-ghost";
    m.textContent = "⚙ Миграция ID (один раз)";
    m.onclick = migrateAllCategories;
    c.appendChild(m);
  }

  let items = currentData.items.map(it => ({...it, category: currentCategory}));

  // фильтр
  if(showOnlyUnvoiced){
    items = items.filter(it => audioStatusById[it.id] === false);
  }

  items.forEach(it=>{
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
  });

  if(adminMode){
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.textContent = "➕ Добавить фразу";
    b.onclick = () => openAddModal(currentCategory);
    c.appendChild(b);
  }
}

function renderSearch(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  renderToolbar(c);

  let items = searchResults || [];
  if(showOnlyUnvoiced){
    items = items.filter(it => audioStatusById[it.id] === false);
  }

  items.forEach(it=>{
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
  });
}

function renderCurrentView(){
  if(currentView !== "search" && (!currentData || !Array.isArray(currentData.items))){
    const c = document.getElementById("content");
    if(c) c.innerHTML = "<p>Выберите категорию.</p>";
    return;
  }
  currentView === "search" ? renderSearch() : renderCategory();
}

/* ================= AUDIO PLAY ================= */
async function playAudio(cat, file){
  const base = file.replace(/\.(mp3|webm)$/i, "");
  const variants = [`${base}.mp3`, `${base}.webm`];

  for(const f of variants){
    const url = `audio/${cat}/${f}?v=${Date.now()}`;
    try{
      const r = await fetch(url, { method:"HEAD" });
      if(!r.ok) continue;

      const audio = new Audio(url);
      await audio.play();
      return;
    }catch(e){}
  }

  toast("Аудио не найдено", false);
}

/* ================= ADMIN UI ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  const dl = document.getElementById("download-zip");
  const lo = document.getElementById("admin-logout"); // может отсутствовать — ок
  if(dl) dl.classList.toggle("hidden", !on);
  if(lo) lo.classList.toggle("hidden", !on);
}

function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  setAdminUI(true);
  renderCurrentView();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

function downloadZip(){
  window.open(`https://github.com/${OWNER}/${REPO}/archive/refs/heads/${BRANCH}.zip`, "_blank");
}

/* ================= CATEGORY RESOLUTION ================= */
async function findCategoryById(id){
  if(phraseIndex[id]) return phraseIndex[id];

  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      if(d.items.some(it => it.id === id)){
        phraseIndex[id] = cat;
        return cat;
      }
    }catch{}
  }
  return null;
}

/* ================= CRUD HELPERS ================= */
function updateCacheFromItem(cat, item){
  const p = allPhrases.find(x => x.id === item.id);
  if(p){
    p.ru = item.ru;
    p.ing = item.ing;
    p.pron = item.pron;
    p.audio = item.audio;
    p.category = cat;
  }else{
    allPhrases.push({ ...item, category: cat });
  }

  phraseIndex[item.id] = cat;

  if(currentView === "search"){
    rebuildSearchResults();
  }
}

function removeFromCache(id){
  allPhrases = allPhrases.filter(x => x.id !== id);
  delete phraseIndex[id];

  if(currentView === "search"){
    rebuildSearchResults();
  }
}

/* ================= CRUD (GitHub JSON) ================= */
async function loadCategoryData(cat){
  const r = await fetch(`categories/${cat}.json`);
  const d = await r.json();
  migrateItems(d);
  return d;
}

async function loadCategoryDataFromGitHubAPI(cat){
  const token = githubToken;
  if(!token) throw new Error("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json?ref=${BRANCH}`;
  const res = await fetch(url, { headers: { Authorization: `token ${token}` } });
  if(!res.ok){
    const txt = await res.text().catch(()=>"(no details)");
    throw new Error("Не удалось прочитать JSON через GitHub API: " + txt);
  }

  const json = await res.json();
  const content = b64DecodeUnicode(json.content.replace(/\n/g, ""));
  const data = JSON.parse(content);
  migrateItems(data);
  return data;
}

async function saveCategoryData(cat, data){
  const token = githubToken;
  if(!token) throw new Error("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;

  let sha = null;
  const check = await fetch(url,{headers:{Authorization:`token ${token}`}});
  if(check.ok) sha = (await check.json()).sha;

  const body = {
    message:`Update ${cat}`,
    content: b64EncodeUnicode(JSON.stringify(data,null,2)),
    sha
  };

  const put = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  if(!put.ok){
    const txt = await put.text().catch(()=>"(no details)");
    throw new Error("Ошибка сохранения JSON: " + txt);
  }
}

/* ================= DELETE ================= */
async function deleteById(id){
  if(!confirm("Удалить фразу?")) return;

  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryDataFromGitHubAPI(cat);
  d.items = d.items.filter(x=>x.id!==id);

  await saveCategoryData(cat, d);

  removeFromCache(id);
  delete audioStatusById[id];

  if(currentCategory === cat){
    currentData = d;
    await scanAudioForItems(d.items.map(it=>({...it, category: cat})));
  }

  toast("Удалено ✓", true);
  renderCurrentView();
}

/* ================= RECORD ================= */
async function recordById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  if(typeof startRecording !== "function"){
    return alert("recorder.js не загружен или startRecording отсутствует");
  }

  startRecording(cat, id); // mp3 = audio/<cat>/<id>.mp3
}

/* ================= SEARCH (с подсказками) ================= */
function setupSearchSuggest(){
  const sInput = document.getElementById("global-search");
  const sBox   = document.getElementById("search-results");
  if(!sInput || !sBox) return;

  sInput.oninput = () => {
    const q = low(sInput.value);
    sBox.innerHTML = "";
    if(q.length < 2){
      sBox.classList.add("hidden");
      return;
    }

    allPhrases
      .filter(p =>
        low(p.ru).includes(q) ||
        low(p.ing).includes(q) ||
        low(p.pron).includes(q)
      )
      .slice(0,20)
      .forEach(p=>{
        const d = document.createElement("div");
        d.className = "search-item";
        d.textContent = `${p.ru} — ${categoryTitles[p.category]}`;
        d.onclick = () => {
          sInput.value = p.ru;
          sBox.classList.add("hidden");
          doSearch();
        };
        sBox.appendChild(d);
      });

    sBox.classList.remove("hidden");
  };

  document.getElementById("search-btn").onclick = doSearch;
}

function rebuildSearchResults(){
  const q = low(lastSearchQuery);
  searchResults = allPhrases.filter(p =>
    low(p.ru).includes(q) ||
    low(p.ing).includes(q) ||
    low(p.pron).includes(q)
  );

  // scan audio statuses for results
  scanAudioForItems(searchResults).then(()=>renderSearch());
}

function doSearch(){
  const sInput = document.getElementById("global-search");
  const sBox   = document.getElementById("search-results");
  const qRaw = safe(sInput?.value);
  const q = low(qRaw);
  if(!q) return;

  if(sBox) sBox.classList.add("hidden");

  lastSearchQuery = qRaw;
  currentView = "search";
  document.getElementById("content-title").textContent = "Поиск: " + qRaw;

  rebuildSearchResults();
}

/* ================= PRELOAD ALL ================= */
async function preloadAllCategories(){
  allPhrases = [];
  phraseIndex = {};

  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      migrateItems(d);

      d.items.forEach(it=>{
        if(!it.audio) it.audio = `${it.id}.mp3`;
        allPhrases.push({...it, category: cat});
        phraseIndex[it.id] = cat;

        // пока неизвестно — не ставим true/false, чтобы не врать
        if(!(it.id in audioStatusById)) audioStatusById[it.id] = false; // дефолт: нет
      });
    }catch{}
  }
}

async function preloadDictionaryForAI(){
  const urls = [
    "https://dosh.inghub.ru/public/dictionary.json",
    "https://raw.githubusercontent.com/ganizhevAmirkhan/ingush-language/main/public/dictionary.json"
  ];

  for(const url of urls){
    try{
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok) continue;
      const data = await res.json();
      const words = Array.isArray(data?.words) ? data.words : [];
      if(words.length){
        dictionaryWords = words;
        return;
      }
    }catch{}
  }
}

/* ================= HOOK AFTER AUDIO UPLOAD ================= */
// recorder.js вызывает этот хук после загрузки mp3
window.onAudioUploaded = async function(cat, id, fileName){
  try{
    const d = await loadCategoryDataFromGitHubAPI(cat);

    const it = d.items.find(x=>x.id===id);
    if(!it) throw new Error("Фраза не найдена в JSON при обновлении аудио");

    const cached = allPhrases.find(x => x.id === id);
    if(cached){
      it.ru = cached.ru;
      it.ing = cached.ing;
      it.pron = cached.pron;
    }

    it.audio = fileName;

    await saveCategoryData(cat, d);

    updateCacheFromItem(cat, it);

    // обновим статус аудио
    audioStatusById[id] = true;

    if(currentCategory === cat && currentView === "category"){
      currentData = d;
      // обновим статистику/рендер
      toast("Аудио сохранено ✓", true);
      renderCurrentView();

      // автопереход к следующей без озвучки
      setTimeout(()=>goToNextUnvoiced(id), 250);
    }else{
      toast("Аудио сохранено ✓", true);
      renderCurrentView();
    }

  }catch(e){
    console.error(e);
    alert("Аудио загрузилось, но обновление JSON/экрана не удалось. Проверь токен/права.");
  }
};

/* ================= UNVOICED NAV ================= */
function goToNextUnvoiced(fromId=null){
  const items = getCurrentItemsForView();
  if(!items.length) return;

  let startIndex = 0;
  if(fromId){
    const idx = items.findIndex(x => x.id === fromId);
    if(idx >= 0) startIndex = idx + 1;
  }

  // ищем вперед
  for(let i=startIndex;i<items.length;i++){
    const it = items[i];
    if(audioStatusById[it.id] === false){
      scrollToPhrase(it.id);
      return;
    }
  }
  // wrap
  for(let i=0;i<startIndex;i++){
    const it = items[i];
    if(audioStatusById[it.id] === false){
      scrollToPhrase(it.id);
      return;
    }
  }

  toast("Все фразы озвучены ✓", true);
}

function scrollToPhrase(id){
  const el = document.getElementById(`ph-${id}`);
  if(!el){
    toast("Фраза не найдена на экране", false);
    return;
  }
  el.scrollIntoView({behavior:"smooth", block:"center"});
  el.classList.add("flash");
  setTimeout(()=>el.classList.remove("flash"), 900);
}

/* ================= AI (LanguageAPI) ================= */
const DEFAULT_LANGUAGE_API_BASE =
  location.hostname === "habar.inghub.ru"
    ? "https://api.inghub.ru"
    : "http://localhost:8787";

function getLanguageApiBase(){
  const saved = safe(localStorage.getItem("languageApiBase")).trim();
  return (saved || DEFAULT_LANGUAGE_API_BASE).replace(/\/+$/, "");
}

function initAiUI(){
  const input = document.getElementById("ai-key");
  if(input && !input.value){
    input.value = getLanguageApiBase();
  }
  refreshApiStatusBadge();
}

function setApiStatusBadge(level){
  const st = document.getElementById("ai-status");
  if(!st) return;
  st.classList.remove("bad", "warn");
  if(level === "ok"){
    st.textContent = "●";
    st.title = "LanguageAPI: OK";
  }else if(level === "warn"){
    st.textContent = "●";
    st.classList.add("warn");
    st.title = "LanguageAPI: Gemini с проблемой";
  }else if(level === "bad"){
    st.textContent = "●";
    st.classList.add("bad");
    st.title = "LanguageAPI: недоступен";
  }else{
    st.textContent = "";
    st.title = "";
  }
}

async function fetchLanguageApiGet(path, timeoutMs=20000){
  const base = getLanguageApiBase();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store"
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }catch{
    return { ok: false, status: 0, json: null };
  }finally{
    clearTimeout(timeoutId);
  }
}

function setApiStatusCard(id, level, title, body){
  const el = document.getElementById(id);
  if(!el) return;
  el.className = `api-status-card ${level}`;
  el.innerHTML = `<strong>${title}</strong><br>${body}`;
}

async function refreshApiStatusBadge(){
  const health = await fetchLanguageApiGet("/health", 8000);
  if(!health.ok || !health.json?.ok){
    setApiStatusBadge("bad");
    return;
  }
  if(!health.json.geminiConfigured){
    setApiStatusBadge("warn");
    return;
  }
  const gemini = await fetchLanguageApiGet("/health/gemini", 35000);
  if(gemini.json?.ok){
    setApiStatusBadge("ok");
  }else{
    setApiStatusBadge("warn");
  }
}

function openApiAdminPanel(){
  const modal = document.getElementById("api-admin-modal");
  if(!modal) return;
  modal.classList.remove("hidden");
  const input = document.getElementById("ai-key");
  if(input && !input.value) input.value = getLanguageApiBase();
  refreshApiAdminPanel();
}

function closeApiAdminPanel(){
  document.getElementById("api-admin-modal")?.classList.add("hidden");
}

async function refreshApiAdminPanel(){
  const base = getLanguageApiBase();
  setApiStatusCard("api-st-server", "warn", "Сервер", `${base}<br>проверка…`);
  setApiStatusCard("api-st-gemini", "warn", "Gemini ключ", "проверка…");
  setApiStatusCard("api-st-test", "warn", "Gemini тест", "проверка…");

  const health = await fetchLanguageApiGet("/health", 8000);
  if(!health.ok || !health.json?.ok){
    setApiStatusCard("api-st-server", "bad", "Сервер", "Недоступен");
    setApiStatusCard("api-st-gemini", "bad", "Gemini ключ", "—");
    setApiStatusCard("api-st-test", "bad", "Gemini тест", "—");
    setApiStatusBadge("bad");
    return;
  }

  setApiStatusCard(
    "api-st-server",
    "ok",
    "Сервер",
    `${base}<br>online ✓`
  );

  if(!health.json.geminiConfigured){
    setApiStatusCard(
      "api-st-gemini",
      "bad",
      "Gemini ключ",
      "Не задан на VPS (.env)"
    );
    setApiStatusCard("api-st-test", "bad", "Gemini тест", "Невозможен без ключа");
    setApiStatusBadge("warn");
  }else{
    const prefix = health.json.geminiKeyPrefix || "…";
    const len = health.json.geminiKeyLength || "?";
    setApiStatusCard(
      "api-st-gemini",
      "ok",
      "Gemini ключ",
      `Задан: ${prefix} (${len} симв.)`
    );

    const gemini = await fetchLanguageApiGet("/health/gemini", 35000);
    if(gemini.status === 404){
      setApiStatusCard(
        "api-st-test",
        "warn",
        "Gemini тест",
        "Обновите API на VPS (git pull + pm2 restart)"
      );
      setApiStatusBadge("warn");
    }else if(gemini.json?.ok){
      setApiStatusCard("api-st-test", "ok", "Gemini тест", "Работает ✓");
      setApiStatusBadge("ok");
    }else{
      const err = gemini.json?.error || `HTTP ${gemini.status}`;
      const detail = gemini.json?.detail || "";
      const msg = languageApiErrorMessage(err);
      setApiStatusCard(
        "api-st-test",
        "bad",
        "Gemini тест",
        `${msg}${detail ? `<br><small>${safe(detail).slice(0, 180)}</small>` : ""}`
      );
      setApiStatusBadge("warn");
    }
  }

  const metrics = await fetchLanguageApiGet("/metrics", 8000);
  const m = metrics.json?.metrics;
  const metricsEl = document.getElementById("api-metrics");
  if(metricsEl){
    if(!m){
      metricsEl.textContent = "Метрики недоступны";
    }else{
      metricsEl.innerHTML = [
        `<strong>Статистика переводов</strong>`,
        `Всего: ${m.translateTotal ?? 0}`,
        `Из словаря (dosh): ${m.translateFromDosh ?? 0}`,
        `Из фраз (habar): ${m.translateFromPhrase ?? 0}`,
        `Из грамматики: ${m.translateFromGrammar ?? 0}`,
        `Из LLM (Gemini): ${m.translateFromLLM ?? 0}`,
        `Отклонено: ${m.translateRejected ?? 0}`
      ].join("<br>");
    }
  }

  const modSection = document.getElementById("api-moderation-section");
  const modList = document.getElementById("api-moderation-list");
  if(modSection && modList && adminMode){
    modSection.classList.remove("hidden");
    const mod = await fetchLanguageApiGet("/moderation/pending", 8000);
    const items = Array.isArray(mod.json?.items) ? mod.json.items : [];
    if(!items.length){
      modList.innerHTML = "<li>Очередь пуста</li>";
    }else{
      modList.innerHTML = items.slice(0, 12).map((it) => {
        const ru = safe(it?.ru).slice(0, 80);
        const reason = languageApiErrorMessage(it?.reason);
        return `<li><strong>${ru}</strong> — ${reason}</li>`;
      }).join("");
    }
  }else if(modSection){
    modSection.classList.add("hidden");
  }
}

async function apiAdminTestTranslate(){
  const ru = safe(document.getElementById("api-test-ru")?.value).trim();
  const out = document.getElementById("api-test-result");
  if(!ru){
    if(out) out.textContent = "Введите русскую фразу";
    return;
  }
  if(out) out.textContent = "Перевод…";

  const base = getLanguageApiBase();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 45000);
  try{
    const res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ru }),
      signal: ctrl.signal,
      cache: "no-store"
    });
    const json = await res.json().catch(() => null);
    if(!out) return;
    if(json?.ok){
      out.textContent = [
        `✓ ${json.translation}`,
        `Источник: ${json.usedSource}`,
        `Уверенность: ${json.confidence}`,
        json.fallbackUsed ? "(через fallback)" : ""
      ].filter(Boolean).join("\n");
    }else{
      const msg = languageApiErrorMessage(json?.error);
      out.textContent = [
        `✗ ${msg}`,
        json?.detail ? json.detail : "",
        `Код: ${json?.error || res.status}`
      ].filter(Boolean).join("\n");
    }
  }catch{
    if(out) out.textContent = "✗ LanguageAPI недоступен";
  }finally{
    clearTimeout(timeoutId);
  }
}

async function apiAdminRefreshData(){
  const base = getLanguageApiBase();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 30000);
  try{
    const res = await fetch(`${base}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => null);
    toast(json?.ok ? "Данные API обновлены ✓" : "Не удалось обновить данные", !!json?.ok);
    if(json?.ok) refreshApiAdminPanel();
  }catch{
    toast("LanguageAPI недоступен", false);
  }finally{
    clearTimeout(timeoutId);
  }
}

function saveAiKey(){
  const base = safe(document.getElementById("ai-key")?.value).trim();
  if(!base) return alert("Введите URL LanguageAPI");
  localStorage.setItem("languageApiBase", base);
  initAiUI();
  toast("LanguageAPI URL сохранён ✓", true);
  refreshApiAdminPanel();
}

function languageApiErrorMessage(code){
  const messages = {
    missing_gemini_key: "В словарях нет перевода. На VPS задайте GEMINI_API_KEY и pm2 restart --update-env",
    invalid_gemini_key: "Ключ Gemini не принят Google. Создайте новый в aistudio.google.com",
    gemini_key_expired: "Ключ Gemini просрочен. Создайте новый в aistudio.google.com и обновите .env на VPS",
    gemini_quota_exceeded: "Исчерпана бесплатная квота Gemini. Подождите или включите billing в Google AI Studio",
    gemini_permission_denied: "Google отклонил ключ. Проверьте проект и billing в Google AI Studio",
    gemini_region_blocked: "Google блокирует запросы с VPS (РФ). Нужен сервер за рубежом или оплата в Google Cloud",
    llm_http_404: "Gemini: модель не найдена. Обновите API (git pull) и pm2 restart 0",
    llm_http_400: "Gemini отклонил запрос (400). Откройте панель 📡 API для детали",
    llm_http_403: "Gemini: ключ не принят. Проверьте GEMINI_API_KEY в .env",
    llm_failed: "Gemini недоступен. Попробуйте позже"
  };
  return messages[code] || code || "Ошибка LanguageAPI";
}

async function callLanguageApi(path, payload){
  const base = getLanguageApiBase();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 15000);
  try{
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
      cache: "no-store"
    });
    const json = await res.json().catch(() => null);
    if(!res.ok || !json?.ok){
      const msg = languageApiErrorMessage(json?.error);
      const extra = json?.detail ? `: ${String(json.detail).slice(0, 120)}` : "";
      toast(msg + extra, false);
      return null;
    }
    return json;
  }catch{
    toast("LanguageAPI недоступен", false);
    return null;
  }finally{
    clearTimeout(timeoutId);
  }
}

function findPhrasePronByIng(ingText){
  const target = safe(ingText).replace(/\s+/g, " ").trim().toLowerCase();
  if(!target) return "";
  const hit = allPhrases.find((p) => safe(p?.ing).replace(/\s+/g, " ").trim().toLowerCase() === target);
  return safe(hit?.pron).trim();
}

function transliterateIngushToPron(ingText){
  const src = safe(ingText).trim();
  if(!src) return "";
  if(/^[a-z0-9\s'`".,!?;:()\-]+$/i.test(src)){
    return src.replace(/\s+/g, " ").trim().toLowerCase();
  }

  let t = src.toLowerCase();
  const multi = [
    [/кх/g, "kh"], [/къ/g, "k'"], [/к1/g, "k1"], [/г1/g, "g1"], [/х1/g, "h1"],
    [/ц1/g, "ts1"], [/ч1/g, "ch1"], [/ш1/g, "sh1"], [/т1/g, "t1"], [/п1/g, "p1"],
    [/б1/g, "b1"], [/д1/g, "d1"], [/ж1/g, "zh1"], [/гӀ/g, "gh1"], [/гӏ/g, "gh1"],
    [/хь/g, "h'"], [/аъ/g, "a'"], [/оъ/g, "o'"], [/уъ/g, "u'"], [/еъ/g, "e'"],
    [/иъ/g, "i'"], [/яъ/g, "ya'"], [/юъ/g, "yu'"]
  ];
  for(const [re, to] of multi) t = t.replace(re, to);

  const single = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "Ӏ": "1", "ӏ": "1", "і": "1", "1": "1"
  };

  let out = "";
  for(const ch of t){
    out += Object.prototype.hasOwnProperty.call(single, ch) ? single[ch] : ch;
  }
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildDictionaryHints(ruText, limit=12){
  const q = low(ruText).trim();
  if(!q || !Array.isArray(dictionaryWords) || !dictionaryWords.length) return [];

  const tokens = q.split(/[\s,.;:!?()"'`«»\-]+/).filter(Boolean);
  const uniq = [...new Set([q, ...tokens])];
  const out = [];
  const seen = new Set();

  for(const w of dictionaryWords){
    const ru = safe(w?.ru);
    const ruLow = low(ru);
    if(!ruLow) continue;

    const matched = uniq.some(t => ruLow === t || ruLow.includes(t) || t.includes(ruLow));
    if(!matched) continue;

    const senses = Array.isArray(w?.senses) ? w.senses : [];
    const ing = senses.map(s => safe(s?.ing).trim()).filter(Boolean);
    if(!ing.length) continue;

    const line = `${ru} -> ${ing.join(" | ")}`;
    if(seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if(out.length >= limit) break;
  }
  return out;
}

function buildSourceContext(ruText){
  const dictHints = buildDictionaryHints(ruText);

  const dictBlock = dictHints.length
    ? dictHints.map(x => `- ${x}`).join("\n")
    : "- (нет совпадений в словаре)";

  return `
Источники (обязательные):
Словарь dosh.inghub.ru (лексика):
${dictBlock}
`.trim();
}

function normalizeRuForLookup(text){
  return low(text)
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^я\s+/, "") // "Я хочу пить" и "Хочу пить" считаем близкими
    .split(" ")
    .map(normalizeRuToken)
    .filter(Boolean)
    .join(" ");
}

function normalizeRuToken(token){
  let t = safe(token).toLowerCase().trim();
  if(!t) return "";

  // Нормализуем частые формы, чтобы "сколько стоят бананы" находило
  // "сколько стоит бананы" и похожие записи в базе.
  if(t === "стоят") t = "стоит";

  // Очень мягкая нормализация окончаний (ru plural/case variants).
  const endings = ["ами","ями","ого","ему","ому","иях","ах","ях","ов","ев","ом","ам","ям","ы","и","а","я","у","ю"];
  if(t.length > 5){
    for(const end of endings){
      if(t.endsWith(end) && t.length - end.length >= 4){
        t = t.slice(0, -end.length);
        break;
      }
    }
  }
  return t;
}

function tokenSetRu(text){
  const norm = normalizeRuForLookup(text);
  if(!norm) return new Set();
  return new Set(norm.split(" ").filter(Boolean));
}

function jaccardSet(a, b){
  if(!a.size || !b.size) return 0;
  let inter = 0;
  for(const x of a){
    if(b.has(x)) inter++;
  }
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

function findPhraseFromHabar(ruText){
  const needle = normalizeRuForLookup(ruText);
  if(!needle) return null;

  // 1) точное совпадение
  let hit = allPhrases.find(p => normalizeRuForLookup(p.ru) === needle);
  if(hit) return hit;

  // 2) мягкое совпадение по включению
  hit = allPhrases.find(p => {
    const hay = normalizeRuForLookup(p.ru);
    return hay && (hay.includes(needle) || needle.includes(hay));
  });
  return hit || null;
}

function findBestPhraseFromHabar(ruText){
  const needleSet = tokenSetRu(ruText);
  if(!needleSet.size) return null;

  let best = null;
  let bestScore = 0;

  for(const p of allPhrases){
    if(!p?.ru || !p?.ing) continue;
    if(/[?？]/.test(safe(p.ru))) continue; // для утверждений избегаем вопросительных

    const s = jaccardSet(needleSet, tokenSetRu(p.ru));
    if(s > bestScore){
      best = p;
      bestScore = s;
    }
  }

  // Порог: не брать случайные фразы.
  return bestScore >= 0.6 ? best : null;
}

function findExactNonQuestionPhraseFromHabar(ruText){
  const needle = normalizeRuForLookup(ruText);
  if(!needle) return null;
  return allPhrases.find(p =>
    normalizeRuForLookup(p.ru) === needle &&
    !/[?？]/.test(safe(p.ru))
  ) || null;
}

function cleanIngCandidate(text){
  return safe(text)
    .split("*")[0]
    .split("(")[0]
    .trim();
}

function parseIngAlternatives(text){
  return safe(text)
    .split("*")
    .map(part => safe(part).split("(")[0].trim())
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findExactIngFromDosh(ruText){
  const needle = normalizeRuForLookup(ruText);
  if(!needle || !Array.isArray(dictionaryWords)) return "";

  const word = dictionaryWords.find(w => normalizeRuForLookup(w?.ru) === needle);
  if(!word) return "";

  const senses = Array.isArray(word.senses) ? word.senses : [];
  const raw = senses[0]?.ing || "";
  const vars = parseIngAlternatives(raw);
  if(!vars.length) return "";

  // В dosh иногда даются альтернативы через "*", показываем их явно.
  if(vars.length > 1) return vars.slice(0, 2).join(" / ");
  return vars[0];
}

function findWordIngFromDosh(ruWord){
  const needle = normalizeRuForLookup(ruWord);
  if(!needle || !Array.isArray(dictionaryWords)) return "";

  const word = dictionaryWords.find(w => normalizeRuForLookup(w?.ru) === needle);
  if(!word) return "";

  const senses = Array.isArray(word.senses) ? word.senses : [];
  const raw = senses[0]?.ing || "";
  return cleanIngCandidate(raw);
}

function findWordIngFromHabar(ruWord){
  const needle = normalizeRuForLookup(ruWord);
  if(!needle || !Array.isArray(allPhrases)) return "";

  const hit = allPhrases.find(p => normalizeRuForLookup(p?.ru) === needle);
  return cleanIngCandidate(hit?.ing);
}

function tryTemplateThisX(ruText){
  const norm = normalizeRuForLookup(ruText);
  const m = norm.match(/^это\s+(.+)$/);
  if(!m) return "";

  const xRu = (m[1] || "").trim();
  if(!xRu) return "";

  const xIng = findWordIngFromDosh(xRu);
  if(!xIng) return "";

  return `Из ${xIng}`;
}

/* 🇷🇺 RU — исправление */
async function aiFixRu(){
  const el = document.getElementById("edit-ru");
  const ru = el?.value || "";
  if(!ru.trim()) return;

  const res = await callLanguageApi("/ai/assist", { task: "fix_ru", text: ru });
  if(res?.text) el.value = res.text;
}

/* 🟢 ING — перевод */
async function aiTranslateIng(){
  const ru = document.getElementById("edit-ru")?.value || "";
  if(!ru.trim()) return;

  const res = await callLanguageApi("/translate", { ru });
  if(!res) return;
  document.getElementById("edit-ing").value = cleanIngCandidate(res.translation);
  if(res.usedSource){
    toast(`Источник: ${res.usedSource}`, true);
  }
}

/* 🔤 PRON — транскрипция */
async function aiMakePron(){
  const ing = document.getElementById("edit-ing")?.value || "";
  if(!ing.trim()) return;

  const fromPhrase = findPhrasePronByIng(ing);
  const pron = fromPhrase || transliterateIngushToPron(ing);
  if(pron){
    document.getElementById("edit-pron").value = pron;
  }
}

/* ================= EDIT MODAL (REPLACES PROMPT EDIT) ================= */
function openModal(){
  const m = document.getElementById("edit-modal");
  if(m) m.classList.remove("hidden");
}
function closeEdit(){
  const m = document.getElementById("edit-modal");
  if(m) m.classList.add("hidden");
  editMode = null;
  editingItemId = null;
  editingCategory = null;
}

async function editById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryDataFromGitHubAPI(cat);
  const it = d.items.find(x=>x.id===id);
  if(!it) return alert("Фраза не найдена");

  editMode = "edit";
  editingItemId = id;
  editingCategory = cat;

  document.getElementById("edit-ru").value = safe(it.ru);
  document.getElementById("edit-ing").value = safe(it.ing);
  document.getElementById("edit-pron").value = safe(it.pron);

  openModal();
}

function openAddModal(cat){
  editMode = "add";
  editingCategory = cat;
  editingItemId = null;

  document.getElementById("edit-ru").value = "";
  document.getElementById("edit-ing").value = "";
  document.getElementById("edit-pron").value = "";

  openModal();
}

async function saveEdit(){
  const ru   = document.getElementById("edit-ru").value.trim();
  const ing  = document.getElementById("edit-ing").value.trim();
  const pron = document.getElementById("edit-pron").value.trim();

  if(!ru || !ing || !pron){
    toast("Заполни RU / ING / PRON", false);
    return;
  }

  if(!githubToken){
    toast("Нужен GitHub Token", false);
    return;
  }

  if(editMode === "edit"){
    if(!editingItemId || !editingCategory) return;

    const cat = editingCategory;
    const d = await loadCategoryDataFromGitHubAPI(cat);
    const it = d.items.find(x=>x.id===editingItemId);
    if(!it) return toast("Фраза не найдена", false);

    it.ru = ru;
    it.ing = ing;
    it.pron = pron;
    if(!it.audio) it.audio = `${it.id}.mp3`;

    await saveCategoryData(cat, d);
    updateCacheFromItem(cat, it);

    // перескан текущей категории (чтобы статистика не глючила)
    if(currentCategory === cat && currentView === "category"){
      currentData = d;
      await scanAudioForItems(d.items.map(x=>({...x, category: cat})));
    }

    closeEdit();
    toast("Сохранено ✓", true);
    renderCurrentView();
    return;
  }

  if(editMode === "add"){
    const cat = editingCategory || currentCategory;
    if(!cat) return toast("Категория не выбрана", false);

    const d = await loadCategoryDataFromGitHubAPI(cat);

    const id = genId();
    const item = { id, ru, ing, pron, audio: `${id}.mp3` };
    d.items.push(item);

    await saveCategoryData(cat, d);
    updateCacheFromItem(cat, item);

    // аудио пока нет
    audioStatusById[id] = false;

    if(currentCategory === cat){
      currentData = d;
      await scanAudioForItems(d.items.map(x=>({...x, category: cat})));
    }

    closeEdit();
    toast("Добавлено ✓", true);
    renderCurrentView();
    return;
  }

  toast("Неизвестный режим окна", false);
}

/* ================= END ================= */
