/* ================= DATA ================= */

const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-phrasebook";
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

let allPhrases = [];     // {ru, ing, pron, category}
let searchResults = [];
let currentView = "category";

window.adminMode = false;
window.githubToken = localStorage.getItem("githubToken") || "";

/* ================= UTILS ================= */

function normalizePron(p){
  return (p || "").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

function safeLower(v){
  return (v || "").toString().toLowerCase();
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
  // элементы
  const sInput = document.getElementById("global-search");
  const sBox   = document.getElementById("search-results");
  const sBtn   = document.getElementById("search-btn");

  const loginBtn = document.getElementById("admin-login");
  const logoutBtn = document.getElementById("admin-logout");
  const zipBtn = document.getElementById("download-zip");

  // bind admin buttons
  loginBtn.onclick = adminLogin;
  logoutBtn.onclick = adminLogout;
  zipBtn.onclick = downloadZip;

  loadCategories();
  await preloadAllCategories(); // важно: до подсказок

  // restore admin
  if (window.githubToken) {
    window.adminMode = true;
    setAdminUI(true);
  } else {
    setAdminUI(false);
  }

  // подсказки (autocomplete)
  function hideSuggestions(){
    sBox.classList.add("hidden");
    sBox.innerHTML = "";
  }

  sInput.addEventListener("input", () => {
    const q = safeLower(sInput.value).trim();
    sBox.innerHTML = "";

    if(q.length < 2){
      hideSuggestions();
      return;
    }

    const found = allPhrases.filter(p =>
      safeLower(p.ru).includes(q) ||
      safeLower(p.ing).includes(q) ||
      safeLower(p.pron).includes(q)
    ).slice(0, 20);

    found.forEach(p => {
      const d = document.createElement("div");
      d.className = "search-item";
      d.textContent = `${p.ru || ""} — ${categoryTitles[p.category] || p.category}`;
      d.onclick = () => {
        sInput.value = p.ru || "";
        hideSuggestions();
        doSearch(); // запускаем поиск сразу
      };
      sBox.appendChild(d);
    });

    if(found.length === 0){
      hideSuggestions();
      return;
    }

    sBox.classList.remove("hidden");
  });

  // клик вне — скрыть
  document.addEventListener("click", (e) => {
    if(!e.target.closest(".search-wrap")){
      hideSuggestions();
    }
  });

  // enter запускает поиск
  sInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      doSearch();
      hideSuggestions();
    }
  });

  // кнопка 🔍
  sBtn.onclick = () => {
    doSearch();
    hideSuggestions();
  };

  // доступ из других функций
  window.__search = { sInput, sBox, hideSuggestions };
});

/* ================= UI HELPERS ================= */

function setAdminUI(isAdmin){
  const status = document.getElementById("admin-status");
  const zipBtn = document.getElementById("download-zip");
  const logoutBtn = document.getElementById("admin-logout");
  const tokenInput = document.getElementById("gh-token");

  if(isAdmin){
    status.textContent = "✓ Админ";
    zipBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    if(tokenInput) tokenInput.value = window.githubToken || "";
  } else {
    status.textContent = "";
    zipBtn.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
}

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

  const r = await fetch(`categories/${cat}.json`);
  currentData = await r.json();

  renderCategory();
}

/* ================= RENDER ================= */

function renderPhrase(item){
  const file = normalizePron(item.pron) + ".mp3";
  const idKey = `${item.category}-${file}`;

  return `
  <div class="phrase">
    <p><b>ING:</b> ${item.ing || ""}</p>
    <p><b>RU:</b> ${item.ru || ""}</p>
    <p><b>PRON:</b> ${item.pron || ""}</p>
    <i>${categoryTitles[item.category] || item.category}</i><br>

    <button onclick="playAudio('${item.category}','${file}')">▶</button>
    <span id="ai-${idKey}">⚪</span>

    ${window.adminMode ? `
      <button onclick="recordFromSearch('${item.category}','${item.pron || ""}')">🎤</button>
      <button onclick="editFromSearch('${item.category}','${item.pron || ""}')">✏</button>
      <button onclick="deleteFromSearch('${item.category}','${item.pron || ""}')">🗑</button>
    ` : ""}
  </div>`;
}

function renderCategory(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  if(!currentData || !Array.isArray(currentData.items)) return;

  currentData.items.forEach(it=>{
    const item = { ...it, category: currentCategory };
    c.insertAdjacentHTML("beforeend", renderPhrase(item));
    checkAudio(item.category, item.pron);
  });

  if(window.adminMode){
    const btn = document.createElement("button");
    btn.textContent = "➕ Добавить фразу";
    btn.onclick = () => addPhrase(currentCategory);
    c.appendChild(btn);
  }
}

function renderSearch(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  searchResults.forEach(it=>{
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
    checkAudio(it.category, it.pron);
  });
}

function renderCurrentView(){
  currentView === "search" ? renderSearch() : renderCategory();
}
window.renderCurrentView = renderCurrentView; // нужно recorder.js

/* ================= AUDIO ================= */

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио нет"));
}

function checkAudio(cat,pron){
  const file = normalizePron(pron) + ".mp3";
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        const el = document.getElementById(`ai-${cat}-${file}`);
        if(el) el.textContent="🟢";
      }
    })
    .catch(()=>{});
}

/* ================= ADMIN ================= */

function adminLogin(){
  const input = document.getElementById("gh-token");
  const t = (input?.value || "").trim();
  if(!t) return alert("Введите GitHub Token");

  window.githubToken = t;
  window.adminMode = true;
  localStorage.setItem("githubToken", t);

  setAdminUI(true);
  renderCurrentView();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  window.githubToken = "";
  window.adminMode = false;
  location.reload();
}

function downloadZip(){
  window.open(
    `https://github.com/${OWNER}/${REPO}/archive/refs/heads/${BRANCH}.zip`,
    "_blank"
  );
}

/* ================= GITHUB SAVE ================= */

async function loadCategoryData(cat){
  const r = await fetch(`categories/${cat}.json`);
  return await r.json();
}

async function saveCategoryData(cat,data){
  if(!window.githubToken) return alert("Нет GitHub Token");

  const path = `categories/${cat}.json`;
  const url  = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  let sha = null;
  const check = await fetch(url, {
    headers: { Authorization: `token ${window.githubToken}` }
  });
  if(check.ok) sha = (await check.json()).sha;

  const put = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${window.githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`Update ${cat}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
      sha
    })
  });

  if(!put.ok){
    const txt = await put.text().catch(()=> "");
    alert("Ошибка сохранения в GitHub: " + put.status + "\n" + txt);
    return;
  }
}

/* ================= CRUD (по pron, не по index) ================= */

async function addPhrase(cat){
  const ru = prompt("Русский:");
  const ing = prompt("Ингушский:");
  const pron = prompt("Произношение (латиница):");
  if(!ru || !ing || !pron) return;

  const data = await loadCategoryData(cat);
  data.items = Array.isArray(data.items) ? data.items : [];
  data.items.push({ru, ing, pron});

  await saveCategoryData(cat, data);
  currentData = data;

  await preloadAllCategories();
  renderCurrentView();
}

async function editFromSearch(cat, pron){
  const data = await loadCategoryData(cat);
  data.items = Array.isArray(data.items) ? data.items : [];

  const key = normalizePron(pron);
  const idx = data.items.findIndex(it => normalizePron(it.pron) === key);
  if(idx === -1) return alert("Фраза не найдена");

  const it = data.items[idx];
  it.ru = prompt("Русский:", it.ru || "");
  it.ing = prompt("Ингушский:", it.ing || "");
  it.pron = prompt("Произношение:", it.pron || "");

  await saveCategoryData(cat, data);
  currentData = (cat === currentCategory) ? data : currentData;

  await preloadAllCategories();
  renderCurrentView();
}

async function deleteFromSearch(cat, pron){
  if(!confirm("Удалить фразу?")) return;

  const data = await loadCategoryData(cat);
  data.items = Array.isArray(data.items) ? data.items : [];

  const key = normalizePron(pron);
  const idx = data.items.findIndex(it => normalizePron(it.pron) === key);
  if(idx === -1) return alert("Фраза не найдена");

  data.items.splice(idx, 1);

  await saveCategoryData(cat, data);
  currentData = (cat === currentCategory) ? data : currentData;

  await preloadAllCategories();
  renderCurrentView();
}

async function recordFromSearch(cat, pron){
  // запись и загрузка mp3 делает recorder.js
  await startRecording(cat, pron);
}

/* ================= SEARCH ================= */

async function preloadAllCategories(){
  allPhrases = [];

  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      const items = Array.isArray(d.items) ? d.items : [];

      items.forEach(it=>{
        allPhrases.push({
          ru: it.ru || "",
          ing: it.ing || "",
          pron: it.pron || "",
          category: cat
        });
      });
    } catch {}
  }
}

function doSearch(){
  const sInput = window.__search?.sInput;
  if(!sInput) return;

  const q = safeLower(sInput.value).trim();
  if(!q) return;

  currentView = "search";
  document.getElementById("content-title").textContent = `Поиск: ${sInput.value}`;

  searchResults = allPhrases.filter(p =>
    safeLower(p.ru).includes(q) ||
    safeLower(p.ing).includes(q) ||
    safeLower(p.pron).includes(q)
  );

  renderSearch();
}
window.doSearch = doSearch; // нужно для onclick из подсказок
