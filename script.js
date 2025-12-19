/* ================= DATA ================= */

const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-phrasebook";
const BRANCH = "main";

const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

const categoryTitles = {
 greetings: "Приветствия",
 basic_phrases: "Базовые фразы",
 personal_info: "Личная информация",
 family: "Семья",
 home: "Дом",
 food: "Еда",
 drinks: "Напитки",
 travel: "Путешествия",
 transport: "Транспорт",
 hunting: "Охота",
 danger: "Опасность",
 thermal: "Тепловизор",
 orientation: "Ориентирование",
 weather: "Погода",
 emotions: "Эмоции",
 health: "Здоровье",
 help: "Помощь",
 commands: "Команды",
 tools: "Инструменты",
 animals: "Животные",
 time: "Время",
 numbers: "Числа",
 colors: "Цвета",
 money: "Деньги",
 shop: "Магазин",
 city: "Город",
 village: "Деревня",
 guests: "Гости",
 communication: "Общение",
 work: "Работа",
 misc: "Разное"
};

/* ================= STATE ================= */

let currentCategory = null;
let currentData = null;

let allPhrases = [];      // [{...phrase, category, _idx}]
let currentView = "category"; // "category" | "search"
let lastSearchQuery = "";

/* ================= GLOBAL STATE ================= */

window.adminMode = false;
window.githubToken = localStorage.getItem("githubToken");

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();
  await preloadAllCategories();
  syncAdminUI();
};

/* ================= UI HELPERS ================= */

function syncAdminUI(){
  const zipBtn = document.getElementById("download-zip");
  const tokenInput = document.getElementById("gh-token");
  const status = document.getElementById("admin-status");

  if (githubToken) {
    adminMode = true;
    if (tokenInput) tokenInput.value = githubToken;
    if (status) status.textContent = "✓ Админ";
    if (zipBtn) zipBtn.classList.remove("hidden");
  } else {
    adminMode = false;
    if (status) status.textContent = "";
    if (zipBtn) zipBtn.classList.add("hidden");
  }
}

function safe(v){ return (v ?? "").toString(); }

/* ================= CATEGORIES ================= */

function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = categoryTitles[cat] || cat;
    d.onclick = () => loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentView = "category";
  currentCategory = cat;

  document.getElementById("content-title").textContent =
    categoryTitles[cat] || cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();

  renderCategory();
}

/* ================= RENDER CORE ================= */

function buildPhraseHTML(p, cat, idx, viewTag){
  // viewTag: "c" category view, "s" search view (чтобы id не пересекались)
  const file = normalizePron(p.pron) + ".mp3";
  const key = `${viewTag}-${cat}-${idx}`;
  const aiId = `ai-${key}`;
  const playId = `play-${key}`;

  return `
    <div class="phrase" data-cat="${cat}" data-idx="${idx}" data-file="${file}">
      <p><b>ING:</b> ${safe(p.ing)}</p>
      <p><b>RU:</b> ${safe(p.ru)}</p>
      <p><b>PRON:</b> ${safe(p.pron)}</p>
      <i>${categoryTitles[cat] || cat}</i><br>

      <button id="${playId}" onclick="playAudio('${cat}','${file}')" disabled>▶</button>
      <span id="${aiId}">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${cat}','${safe(p.pron)}')">🎤</button>
        <button onclick="editPhraseBy('${cat}',${idx})">✏</button>
        <button onclick="deletePhraseBy('${cat}',${idx})">🗑</button>
      ` : ""}
    </div>
  `;
}

function renderCategory(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  if(!currentData || !Array.isArray(currentData.items)) return;

  currentData.items.forEach((p, idx) => {
    content.insertAdjacentHTML("beforeend", buildPhraseHTML(p, currentCategory, idx, "c"));
    checkAudioUI("c", currentCategory, idx);
  });

  if(adminMode){
    const b = document.createElement("button");
    b.textContent = "➕ Добавить фразу";
    b.onclick = addPhrase;
    content.appendChild(b);
  }
}

function renderSearch(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  const q = lastSearchQuery;
  const results = allPhrases.filter(p =>
    low(p.ru).includes(q) ||
    low(p.ing).includes(q) ||
    low(p.pron).includes(q)
  );

  results.forEach(p=>{
    // p._idx — индекс внутри ЕГО категории
    content.insertAdjacentHTML("beforeend", buildPhraseHTML(p, p.category, p._idx, "s"));
    checkAudioUI("s", p.category, p._idx);
  });

  if(results.length === 0){
    content.innerHTML = `<div class="phrase">Ничего не найдено</div>`;
  }
}

function renderCurrentView(){
  if(currentView === "search") renderSearch();
  else renderCategory();
}

/* ================= AUDIO ================= */

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}
function low(v){ return safe(v).toLowerCase(); }

function playAudio(cat,file){
  // если кнопка активна — значит HEAD уже ok, но всё равно ловим ошибки
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Ошибка воспроизведения"));
}

function checkAudioUI(viewTag, cat, idx){
  const file = normalizePron((getPhraseBy(cat, idx)?.pron)||"") + ".mp3";
  const key = `${viewTag}-${cat}-${idx}`;
  const aiEl = document.getElementById(`ai-${key}`);
  const playBtn = document.getElementById(`play-${key}`);

  // дефолт: нет аудио
  if(aiEl) aiEl.textContent = "⚪";
  if(playBtn) playBtn.disabled = true;

  fetch(`audio/${cat}/${file}`, { method:"HEAD" })
    .then(r=>{
      if(r.ok){
        if(aiEl) aiEl.textContent = "🟢";
        if(playBtn) playBtn.disabled = false;
      }
    })
    .catch(()=>{});
}

/* ================= ADMIN LOGIN ================= */

function adminLogin(){
  const token = document.getElementById("gh-token").value.trim();
  if(!token) return alert("Введите GitHub Token");

  githubToken = token;
  adminMode = true;
  localStorage.setItem("githubToken", token);

  syncAdminUI();
  renderCurrentView();
}

/* ================= JSON SAVE/LOAD (GitHub API) ================= */

async function loadCategoryData(cat){
  const r = await fetch(`categories/${cat}.json`);
  return await r.json();
}

async function saveCategoryData(cat, data){
  if(!githubToken) return alert("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;

  let sha = null;
  const check = await fetch(url, { headers:{ Authorization:`token ${githubToken}` } });
  if(check.ok){
    const j = await check.json();
    sha = j.sha;
  }

  const body = {
    message: `Update ${cat}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    sha
  };

  const put = await fetch(url, {
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  if(!put.ok){
    const t = await put.text();
    console.error(t);
    alert("Не удалось сохранить JSON в GitHub");
  }
}

/* ================= CRUD ================= */

function getPhraseBy(cat, idx){
  if(currentView !== "search" && cat === currentCategory && currentData){
    return currentData.items?.[idx] || null;
  }
  // в поиске мы работаем по cat/idx, поэтому загрузим из allPhrases
  const hit = allPhrases.find(x => x.category === cat && x._idx === idx);
  return hit || null;
}

async function addPhrase(){
  if(!adminMode) return;
  if(!currentCategory) return alert("Сначала выберите категорию");

  const ru   = prompt("Русский:");
  const ing  = prompt("Ингушский:");
  const pron = prompt("Произношение:");
  if(!ru || !ing || !pron) return;

  const d = await loadCategoryData(currentCategory);
  if(!Array.isArray(d.items)) d.items = [];

  d.items.push({ ru, ing, pron });

  await saveCategoryData(currentCategory, d);
  await preloadAllCategories();

  currentData = d;
  renderCurrentView();
}

async function editPhraseBy(cat, idx){
  if(!adminMode) return;

  const d = await loadCategoryData(cat);
  const it = d.items?.[idx];
  if(!it) return alert("Фраза не найдена");

  const ru   = prompt("Русский:", it.ru ?? "");
  const ing  = prompt("Ингушский:", it.ing ?? "");
  const pron = prompt("Произношение:", it.pron ?? "");
  if(ru === null || ing === null || pron === null) return; // отмена

  it.ru = ru;
  it.ing = ing;
  it.pron = pron;

  await saveCategoryData(cat, d);
  await preloadAllCategories();

  if(currentCategory === cat){
    currentData = d;
  }

  // 🔄 если мы в поиске — пересобрать результаты
  if (currentView === "search") {
    doSearch(lastSearchQuery, true);
  } else {
    renderCategory();
  }
}

async function deletePhraseBy(cat, idx){
  if(!adminMode) return;
  if(!confirm("Удалить фразу?")) return;

  const d = await loadCategoryData(cat);
  if(!Array.isArray(d.items) || !d.items[idx]) return alert("Фраза не найдена");

  d.items.splice(idx, 1);

  await saveCategoryData(cat, d);
  await preloadAllCategories();

  if(currentCategory === cat){
    currentData = d;
  }

  // 🔄 если мы в поиске — пересобрать результаты
  if (currentView === "search") {
    doSearch(lastSearchQuery, true);
  } else {
    renderCategory();
  }
}

/* ================= SEARCH (SUGGESTIONS + RESULTS) ================= */

async function preloadAllCategories(){
  allPhrases = [];

  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      if(!Array.isArray(d.items)) continue;

      d.items.forEach((it, idx)=>{
        allPhrases.push({ ...it, category: cat, _idx: idx });
      });
    }catch{}
  }
}

const sInput = document.getElementById("global-search");
const sBox   = document.getElementById("search-results");

function hideSuggestions(){
  if(!sBox) return;
  sBox.classList.add("hidden");
  sBox.innerHTML = "";
}

sInput.oninput = ()=>{
  const q = low(sInput.value).trim();
  if(!sBox) return;
  sBox.innerHTML = "";

  if(q.length < 2){
    hideSuggestions();
    return;
  }

  allPhrases
    .filter(p => low(p.ru).includes(q) || low(p.ing).includes(q) || low(p.pron).includes(q))
    .slice(0,20)
    .forEach(p=>{
      const d = document.createElement("div");
      d.className="search-item";
      d.textContent = `${safe(p.ru)} — ${categoryTitles[p.category] || p.category}`;
      d.onclick = ()=>{
        sInput.value = safe(p.ru);
        hideSuggestions();
        doSearch(sInput.value);
      };
      sBox.appendChild(d);
    });

  sBox.classList.remove("hidden");
};

document.getElementById("search-btn").onclick = ()=>doSearch(sInput.value);

function doSearch(query, silent){
  const q = low(query).trim();
  if(!q) return;

  lastSearchQuery = q;
  currentView = "search";

  hideSuggestions();
  document.getElementById("content-title").textContent = `Поиск: ${safe(query)}`;

  renderSearch();

  if(!silent){
    // ничего
  }
}

document.addEventListener("click",e=>{
  if(!e.target.closest(".search-wrap")){
    hideSuggestions();
  }
});

/* ================= ZIP ================= */

function downloadZip(){
  window.open(
    `https://github.com/${OWNER}/${REPO}/archive/refs/heads/${BRANCH}.zip`,
    "_blank"
  );
}
