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

/* ================= INIT ================= */
window.onload = async () => {
  loadCategories();
  await preloadAllCategories();

  if(githubToken){
    adminMode = true;
    setAdminUI(true);
  }

  setupSearchSuggest();
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

/* ================= RENDER ================= */
function renderPhrase(item){
  const file = item.audio || `${item.id}.mp3`;

  return `
  <div class="phrase" id="ph-${item.id}">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>
    <i>${categoryTitles[item.category]}</i><br>

    <button id="pb-${item.id}" class="play-btn" disabled onclick="playAudio('${item.category}','${file}','${item.id}')">▶</button>
    <span id="ai-${item.id}">⚪</span>

    ${adminMode ? `
      <button onclick="recordById('${item.id}')">🎤</button>
      <button onclick="editById('${item.id}')">✏</button>
      <button onclick="deleteById('${item.id}')">🗑</button>
    ` : ""}
  </div>`;
}

function renderCategory(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  if(adminMode){
    const m = document.createElement("button");
    m.textContent = "⚙ Миграция ID (один раз)";
    m.onclick = migrateAllCategories;
    c.appendChild(m);
  }

  currentData.items.forEach(it=>{
    it.category = currentCategory;
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
    checkAudio(it.category, it.audio || `${it.id}.mp3`, it.id);
  });

  if(adminMode){
    const b = document.createElement("button");
    b.textContent = "➕ Добавить фразу";
    b.onclick = () => addPhrase(currentCategory);
    c.appendChild(b);
  }
}

function renderSearch(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  searchResults.forEach(it=>{
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
    checkAudio(it.category, it.audio || `${it.id}.mp3`, it.id);
  });
}

function renderCurrentView(){
  currentView === "search" ? renderSearch() : renderCategory();
}

/* ================= AUDIO ================= */
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

  alert("Аудио не найдено");
}

function checkAudio(cat, file, id){
  const base = file.replace(/\.(mp3|webm)$/i, "");
  const variants = [`${base}.mp3`, `${base}.webm`];

  (async ()=>{
    for(const f of variants){
      const r = await fetch(`audio/${cat}/${f}`, { method:"HEAD" }).catch(()=>null);
      if(r && r.ok){
        const dot = document.getElementById(`ai-${id}`);
        if(dot) dot.textContent = "🟢";
        const btn = document.getElementById(`pb-${id}`);
        if(btn) btn.disabled = false;
        return;
      }
    }
  })();
}

/* ================= ADMIN UI ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  const dl = document.getElementById("download-zip");
  const lo = document.getElementById("admin-logout");
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

  // fallback (редко понадобится)
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
  // allPhrases
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

  // index
  phraseIndex[item.id] = cat;

  // если сейчас поиск — обновим searchResults из allPhrases
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
  // для отображения можно с pages
  const r = await fetch(`categories/${cat}.json`);
  const d = await r.json();
  migrateItems(d);
  return d;
}

// ВАЖНО: эта функция читает JSON именно через GitHub API (без кэша Pages)
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

async function addPhrase(cat){
  const ru   = prompt("Русский:");
  const ing  = prompt("Ингушский:");
  const pron = prompt("Произношение:");
  if(!ru || !ing || !pron) return;

  const d = await loadCategoryDataFromGitHubAPI(cat); // ✅ без кэша
  const id = genId();
  const item = { id, ru, ing, pron, audio: `${id}.mp3` };
  d.items.push(item);

  await saveCategoryData(cat, d);

  // ✅ обновляем кэш вручную (не перезагружаем pages)
  updateCacheFromItem(cat, item);

  if(currentCategory === cat){
    currentData = d;
  }

  renderCurrentView();
}

async function editById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryDataFromGitHubAPI(cat); // ✅ без кэша
  const it = d.items.find(x=>x.id===id);
  if(!it) return alert("Фраза не найдена");

  const newRu   = prompt("Русский:", it.ru);
  const newIng  = prompt("Ингушский:", it.ing);
  const newPron = prompt("Произношение:", it.pron);

  if(newRu === null || newIng === null || newPron === null) return;

  it.ru   = newRu;
  it.ing  = newIng;
  it.pron = newPron;

  if(!it.audio) it.audio = `${it.id}.mp3`;

  await saveCategoryData(cat, d);

  // ✅ СРАЗУ фиксируем в памяти (это ключ к твоей проблеме)
  updateCacheFromItem(cat, it);

  if(currentCategory === cat){
    currentData = d;
  }

  renderCurrentView();
}

async function deleteById(id){
  if(!confirm("Удалить фразу?")) return;

  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryDataFromGitHubAPI(cat); // ✅ без кэша
  d.items = d.items.filter(x=>x.id!==id);

  await saveCategoryData(cat, d);

  // ✅ обновляем кэш
  removeFromCache(id);

  if(currentCategory === cat){
    currentData = d;
  }

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
  renderSearch();
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
      });
    }catch{}
  }
}

/* ================= HOOK AFTER AUDIO UPLOAD ================= */
// recorder.js вызывает этот хук после загрузки mp3
window.onAudioUploaded = async function(cat, id, fileName){
  try{
    // ✅ 1) берём АКТУАЛЬНЫЙ JSON через GitHub API (не через Pages)
    const d = await loadCategoryDataFromGitHubAPI(cat);

    // ✅ 2) находим item
    const it = d.items.find(x=>x.id===id);
    if(!it) throw new Error("Фраза не найдена в JSON при обновлении аудио");

    // ✅ 3) ОБНОВЛЯЕМ ТОЛЬКО audio, но при этом
    //      берём свежий текст из кэша (чтобы никогда не откатился)
    const cached = allPhrases.find(x => x.id === id);
    if(cached){
      it.ru = cached.ru;
      it.ing = cached.ing;
      it.pron = cached.pron;
    }

    it.audio = fileName; // обычно id.mp3

    // ✅ 4) сохраняем JSON
    await saveCategoryData(cat, d);

    // ✅ 5) фиксируем в кэше
    updateCacheFromItem(cat, it);

    // ✅ 6) обновляем текущие данные категории (если открыта)
    if(currentCategory === cat && currentView === "category"){
      currentData = d;
    }

    // ✅ 7) перерисовка
    renderCurrentView();

  }catch(e){
    console.error(e);
    alert("Аудио загрузилось, но обновление JSON/экрана не удалось. Проверь токен/права.");
  }
};
/* ================= AI ================= */

let editingItemId = null;

function saveAiKey(){
  const key = document.getElementById("ai-key").value.trim();
  if(!key) return alert("Введите OpenAI API ключ");
  localStorage.setItem("openaiKey", key);
  document.getElementById("ai-status").textContent = "✓";
}

async function callAI(prompt){
  const key = localStorage.getItem("openaiKey");
  if(!key){
    alert("Нет OpenAI API ключа");
    return "";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + key,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {role:"system",content:"Ты помощник для создания разговорника."},
        {role:"user",content:prompt}
      ]
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

/* 🇷🇺 RU */
async function aiFixRu(){
  const ru = document.getElementById("edit-ru").value;
  const out = await callAI(
    "Исправь орфографию и стиль, не меняя смысл:\n" + ru
  );
  if(out) document.getElementById("edit-ru").value = out;
}

/* 🟢 ING */
async function aiTranslateIng(){
  const ru = document.getElementById("edit-ru").value;
  const out = await callAI(
    "Переведи на ингушский язык:\n" + ru
  );
  if(out) document.getElementById("edit-ing").value = out;
}

/* 🔤 PRON */
async function aiMakePron(){
  const ing = document.getElementById("edit-ing").value;
  const out = await callAI(
    "Сделай латинскую транскрипцию для произношения:\n" + ing
  );
  if(out) document.getElementById("edit-pron").value =
    out.toLowerCase().replace(/\s+/g,"_");
}

/* ================= EDIT MODAL ================= */

async function editById(id){
  editingItemId = id;
  const cat = await findCategoryById(id);
  const d = await loadCategoryDataFromGitHubAPI(cat);
  const it = d.items.find(x=>x.id===id);

  document.getElementById("edit-ru").value = it.ru;
  document.getElementById("edit-ing").value = it.ing;
  document.getElementById("edit-pron").value = it.pron;

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEdit(){
  document.getElementById("edit-modal").classList.add("hidden");
  editingItemId = null;
}

async function saveEdit(){
  if(!editingItemId) return;

  const ru   = document.getElementById("edit-ru").value.trim();
  const ing  = document.getElementById("edit-ing").value.trim();
  const pron = document.getElementById("edit-pron").value.trim();

  const cat = await findCategoryById(editingItemId);
  const d = await loadCategoryDataFromGitHubAPI(cat);
  const it = d.items.find(x=>x.id===editingItemId);

  it.ru = ru;
  it.ing = ing;
  it.pron = pron;

  await saveCategoryData(cat, d);
  updateCacheFromItem(cat, it);

  if(currentCategory === cat){
    currentData = d;
  }

  closeEdit();
  renderCurrentView();
}


