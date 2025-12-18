/* ================= CONFIG ================= */

const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-phrasebook";
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

let allPhrases = [];
let phraseIndex = {};   // id -> category
let searchResults = [];
let currentView = "category";

let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

/* ================= UTILS ================= */

function genId(){
  return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
}
const safe = v => (v ?? "").toString();
const low  = v => safe(v).toLowerCase();

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();
  await preloadAllCategories();

  if(githubToken){
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
    document.getElementById("download-zip").classList.remove("hidden");
    document.getElementById("admin-logout").classList.remove("hidden");
  }
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
    if(!it.audio){
      // ✅ теперь по умолчанию webm
      it.audio = it.id + ".webm";
      changed = true;
    }
  });
  return changed;
}

async function migrateAllCategories(){
  if(!confirm("Зафиксировать id и audio во всех категориях?")) return;

  for(const cat of categories){
    const d = await loadCategoryData(cat);
    if(migrateItems(d)){
      await saveCategoryData(cat, d);
    }
  }

  alert("Миграция завершена. Страница перезагрузится.");
  location.reload();
}

/* ================= RENDER ================= */

function renderPhrase(item){
  return `
  <div class="phrase">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>
    <i>${categoryTitles[item.category]}</i><br>

    <button onclick="playAudio('${item.category}','${item.audio}')">▶</button>
    <span id="ai-${item.audio}">⚪</span>

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
    checkAudio(it.category, it.audio);
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
    checkAudio(it.category, it.audio);
  });
}

function renderCurrentView(){
  currentView === "search" ? renderSearch() : renderCategory();
}

/* ================= AUDIO ================= */

function checkAudio(cat, file){
  const base = file.replace(/\.(mp3|webm)$/i, "");
  const variants = [
    file,
    `${base}.webm`,
    `${base}.mp3`
  ];

  const el = document.getElementById(`ai-${file}`);
  if(!el) return;

  let checked = 0;

  variants.forEach(f=>{
    const audio = new Audio(`audio/${cat}/${f}`);

    audio.oncanplaythrough = () => {
      el.textContent = "🟢";
    };

    audio.onerror = () => {
      checked++;
      if(checked === variants.length && el.textContent !== "🟢"){
        el.textContent = "⚪";
      }
    };
  });
}


/* ================= ADMIN ================= */

function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  document.getElementById("admin-status").textContent = "✓ Админ";
  document.getElementById("download-zip").classList.remove("hidden");
  document.getElementById("admin-logout").classList.remove("hidden");

  renderCurrentView();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

function downloadZip(){
  window.open(
    `https://github.com/${OWNER}/${REPO}/archive/refs/heads/${BRANCH}.zip`,
    "_blank"
  );
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

/* ================= CRUD ================= */

async function loadCategoryData(cat){
  const r = await fetch(`categories/${cat}.json`);
  const d = await r.json();
  migrateItems(d);
  return d;
}

async function saveCategoryData(cat,data){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;

  let sha = null;
  const check = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  if(check.ok) sha = (await check.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`Update ${cat}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
      sha
    })
  });
}

async function addPhrase(cat){
  const ru = prompt("Русский:");
  const ing = prompt("Ингушский:");
  const pron = prompt("Произношение:");
  if(!ru || !ing || !pron) return;

  const d = await loadCategoryData(cat);
  const id = genId();

  // ✅ audio теперь webm
  d.items.push({
    id,
    ru,
    ing,
    pron,
    audio: id + ".webm"
  });

  await saveCategoryData(cat,d);
  await preloadAllCategories();
  currentData = d;
  renderCurrentView();
}

async function editById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryData(cat);
  const it = d.items.find(x=>x.id===id);
  if(!it) return alert("Фраза не найдена");

  it.ru = prompt("Русский:", it.ru);
  it.ing = prompt("Ингушский:", it.ing);
  it.pron = prompt("Произношение:", it.pron);

  await saveCategoryData(cat,d);
  await preloadAllCategories();

  if(currentCategory === cat) currentData = d;
  renderCurrentView();
}

async function deleteById(id){
  if(!confirm("Удалить фразу?")) return;

  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryData(cat);
  d.items = d.items.filter(x=>x.id!==id);

  await saveCategoryData(cat,d);
  await preloadAllCategories();

  if(currentCategory === cat) currentData = d;
  renderCurrentView();
}

async function recordById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");
  startRecording(cat,id);
}

/* ================= SEARCH ================= */

async function preloadAllCategories(){
  allPhrases = [];
  phraseIndex = {};

  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      migrateItems(d);

      d.items.forEach(it=>{
        allPhrases.push({...it, category: cat});
        phraseIndex[it.id] = cat;
      });
    }catch{}
  }
}

const sInput = document.getElementById("global-search");
const sBox   = document.getElementById("search-results");

sInput.oninput = () => {
  const q = low(sInput.value);
  sBox.innerHTML = "";
  if(q.length < 2){
    sBox.classList.add("hidden");
    return;
  }

  allPhrases.filter(p =>
    low(p.ru).includes(q) ||
    low(p.ing).includes(q) ||
    low(p.pron).includes(q)
  ).slice(0,20).forEach(p=>{
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

function doSearch(){
  const q = low(sInput.value);
  if(!q) return;

  currentView = "search";
  document.getElementById("content-title").textContent = "Поиск: " + sInput.value;

  searchResults = allPhrases.filter(p =>
    low(p.ru).includes(q) ||
    low(p.ing).includes(q) ||
    low(p.pron).includes(q)
  );

  renderSearch();
}
// ===== SIMPLE AUDIO PLAYER (FINAL) =====
window.playAudio = function(cat, file){
  console.log("▶ playAudio:", cat, file);

  const url = `audio/${cat}/${file}`;
  const audio = new Audio(url);

  audio.preload = "auto";
  audio.volume = 1;
  audio.muted = false;

  audio.oncanplay = () => {
    audio.play()
      .then(() => console.log("🔊 playing", url))
      .catch(err => console.error("❌ play error", err));
  };

  audio.onerror = (e) => {
    console.error("❌ audio load error", url, e);
  };
};





