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

/* ================= AI (Gemini) ================= */
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash"
];

let resolvedGeminiModel = null;

function getAiKey(){
  // Совместимость: если раньше был сохранен openaiKey, принимаем его как ключ Gemini.
  return localStorage.getItem("geminiKey") || localStorage.getItem("openaiKey") || "";
}

function initAiUI(){
  const key = getAiKey();
  const st = document.getElementById("ai-status");
  if(st) st.textContent = key ? "✓" : "";
}

function saveAiKey(){
  const key = document.getElementById("ai-key")?.value?.trim();
  if(!key) return alert("Введите Gemini API ключ");
  localStorage.setItem("geminiKey", key);
  localStorage.removeItem("openaiKey");
  initAiUI();
  toast("Ключ сохранён ✓", true);
}

async function callAI(prompt){
  const key = getAiKey();
  if(!key){
    toast("Нет Gemini API ключа", false);
    return "";
  }

  const body = {
    contents: [{
      role: "user",
      parts: [{
        text:
`Ты помощник для создания ингушского разговорника.
Отвечай только готовым текстом без пояснений.

${prompt}`
      }]
    }],
    generationConfig: {
      temperature: 0.3
    }
  };

  const dynamicModels = await fetchGeminiModels(key);
  const modelsToTry = buildModelTryList(dynamicModels);

  let lastErrorText = "";
  for(const model of modelsToTry){
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(body)
    });

    if(res.ok){
      resolvedGeminiModel = model;
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p?.text || "").join("").trim();
      if(text) return text;
      return "";
    }

    const txt = await res.text().catch(()=>"(no details)");
    lastErrorText = txt;

    // Если модель недоступна, пробуем следующую.
    if(res.status === 404) continue;

    console.error("Gemini error:", txt);
    toast("Ошибка ИИ (ключ/лимиты)", false);
    return "";
  }

  console.error("Gemini error:", lastErrorText || "Model not found");
  toast("Ошибка ИИ: модель недоступна", false);
  return "";
}

async function fetchGeminiModels(key){
  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if(!res.ok) return [];
    const json = await res.json();
    const models = Array.isArray(json?.models) ? json.models : [];

    return models
      .filter(m => (m?.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => (m?.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }catch{
    return [];
  }
}

function buildModelTryList(dynamicModels){
  const out = [];
  const pushUnique = (m)=>{
    if(!m || out.includes(m)) return;
    out.push(m);
  };

  // 1) ранее успешно найденная модель
  pushUnique(resolvedGeminiModel);

  // 2) наш приоритетный список
  GEMINI_MODELS.forEach(pushUnique);

  // 3) модели, которые реально доступны для текущего ключа
  dynamicModels.forEach(pushUnique);

  return out;
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

function buildPhraseHints(ruText, limit=8){
  const q = low(ruText).trim();
  if(!q || !Array.isArray(allPhrases) || !allPhrases.length) return [];

  const out = [];
  const seen = new Set();
  for(const p of allPhrases){
    const ru = safe(p?.ru).trim();
    const ing = safe(p?.ing).trim();
    if(!ru || !ing) continue;

    const ruLow = low(ru);
    if(!(ruLow.includes(q) || q.includes(ruLow))) continue;

    const line = `${ru} -> ${ing}`;
    if(seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if(out.length >= limit) break;
  }
  return out;
}

function buildSourceContext(ruText){
  const dictHints = buildDictionaryHints(ruText);
  const phraseHints = buildPhraseHints(ruText);

  const dictBlock = dictHints.length
    ? dictHints.map(x => `- ${x}`).join("\n")
    : "- (нет совпадений в словаре)";

  const phraseBlock = phraseHints.length
    ? phraseHints.map(x => `- ${x}`).join("\n")
    : "- (нет совпадений по фразам)";

  return `
Источники (обязательные):
1) Словарь dosh.inghub.ru (лексика):
${dictBlock}

2) Фразы habar.inghub.ru (контекст употребления):
${phraseBlock}
`.trim();
}

function normalizeRuForLookup(text){
  return low(text)
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^я\s+/, ""); // "Я хочу пить" и "Хочу пить" считаем близкими
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

  const xIng = findWordIngFromDosh(xRu) || findWordIngFromHabar(xRu);
  if(!xIng) return "";

  return `Из ${xIng}`;
}

/* 🇷🇺 RU — исправление */
async function aiFixRu(){
  const el = document.getElementById("edit-ru");
  const ru = el?.value || "";
  if(!ru.trim()) return;

  const out = await callAI("Исправь орфографию и стиль, не меняя смысл. Верни только исправленный текст:\n" + ru);
  if(out) el.value = out;
}

/* 🟢 ING — перевод */
async function aiTranslateIng(){
  const ru = document.getElementById("edit-ru")?.value || "";
  if(!ru.trim()) return;

  // 1) Точное совпадение в habar (без вопросительных вариантов).
  const exact = findExactNonQuestionPhraseFromHabar(ru);
  if(exact?.ing){
    document.getElementById("edit-ing").value = safe(exact.ing);
    toast("Взято из habar ✓", true);
    return;
  }

  // 2) Шаблон "Это X" (лексема X из dosh/habar).
  const templated = tryTemplateThisX(ru);
  if(templated){
    document.getElementById("edit-ing").value = templated;
    toast("Собрано по шаблону dosh/habar ✓", true);
    return;
  }

  // 3) Мягкий поиск готового варианта в habar.
  const habarHit = findPhraseFromHabar(ru);
  if(habarHit?.ing){
    document.getElementById("edit-ing").value = safe(habarHit.ing);
    toast("Взято из habar ✓", true);
    return;
  }

  // 4) Только затем ИИ.
  const src = buildSourceContext(ru);
  const out = await callAI(
`Переведи на ингушский язык. Верни только перевод одной строкой.
Используй только лексику и формы, подтвержденные источниками ниже.
Запрещено использовать чеченские формы и неподтвержденные варианты.

${src}

Текст для перевода:
${ru}`
  );
  if(out) document.getElementById("edit-ing").value = out;
}

/* 🔤 PRON — транскрипция */
async function aiMakePron(){
  const ing = document.getElementById("edit-ing")?.value || "";
  if(!ing.trim()) return;

  const out = await callAI("Сделай латинскую транскрипцию (произношение) одной строкой. Без кавычек и без пояснений:\n" + ing);
  if(out){
    document.getElementById("edit-pron").value = out.toLowerCase().trim();
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
