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
let allPhrases = [];
let phraseIndex = {};
let currentView = "category";
let searchResults = [];
let lastSearchQuery = "";

let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

/* ================= UTILS ================= */
const safe = v => (v ?? "").toString();
const low  = v => safe(v).toLowerCase();

function genId(){
  return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
}

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

/* ================= CATEGORY ================= */
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
  data.items.forEach(it=>{
    if(!it.id) it.id = genId();
    if(!it.audio) it.audio = `${it.id}.mp3`;
  });
}

/* ================= RENDER ================= */
function renderPhrase(item){
  return `
  <div class="phrase">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>

    ${adminMode ? `
      <button onclick="recordById('${item.id}')">🎤</button>
      <button onclick="openEdit('${item.id}')">✏</button>
    ` : ""}
  </div>`;
}

function renderCategory(){
  const c = document.getElementById("content");
  c.innerHTML = "";
  currentData.items.forEach(it=>{
    it.category = currentCategory;
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
  });
}

/* ================= ADMIN ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
}

function adminLogin(){
  githubToken = document.getElementById("gh-token").value.trim();
  if(!githubToken) return alert("Введите GitHub Token");
  localStorage.setItem("githubToken", githubToken);
  adminMode = true;
  setAdminUI(true);
  renderCategory();
}

/* ================= RECORD ================= */
async function recordById(id){
  const cat = phraseIndex[id];
  startRecording(cat, id);
}

/* ================= SEARCH ================= */
function setupSearchSuggest(){}

/* ================= CACHE ================= */
async function preloadAllCategories(){
  allPhrases = [];
  phraseIndex = {};
  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      migrateItems(d);
      d.items.forEach(it=>{
        allPhrases.push({...it, category:cat});
        phraseIndex[it.id] = cat;
      });
    }catch{}
  }
}

/* =========================================================
   🤖 AI SECTION
========================================================= */

let editingId = null;

function saveAiKey(){
  const key = document.getElementById("ai-key").value.trim();
  if(!key) return alert("Введите OpenAI API Key");
  localStorage.setItem("openaiKey", key);
  document.getElementById("ai-status").textContent = "✓";
}

async function callAI(prompt){
  const key = localStorage.getItem("openaiKey");
  if(!key) return alert("Нет OpenAI API ключа");

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + key,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {role:"system",content:"Ты помощник для разговорника."},
        {role:"user",content:prompt}
      ]
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

/* ===== MODAL ===== */
async function openEdit(id){
  editingId = id;
  const cat = phraseIndex[id];
  const r = await fetch(`categories/${cat}.json`);
  const d = await r.json();
  const it = d.items.find(x=>x.id===id);

  editRu.value = it.ru;
  editIng.value = it.ing;
  editPron.value = it.pron;

  editModal.classList.remove("hidden");
}

function closeEdit(){
  editModal.classList.add("hidden");
  editingId = null;
}

async function saveEdit(){
  const cat = phraseIndex[editingId];
  const r = await fetch(`categories/${cat}.json`);
  const d = await r.json();
  const it = d.items.find(x=>x.id===editingId);

  it.ru   = editRu.value.trim();
  it.ing  = editIng.value.trim();
  it.pron = editPron.value.trim();

  await saveCategory(cat, d);
  closeEdit();
  loadCategory(cat);
}

async function saveCategory(cat,data){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;
  const check = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  const sha = (await check.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"edit phrase",
      sha,
      content:b64EncodeUnicode(JSON.stringify(data,null,2))
    })
  });
}

/* ===== AI BUTTONS ===== */
async function aiFixRu(){
  editRu.value = await callAI("Исправь орфографию:\n"+editRu.value);
}
async function aiTranslateIng(){
  editIng.value = await callAI("Переведи на ингушский:\n"+editRu.value);
}
async function aiMakePron(){
  editPron.value = (await callAI("Сделай транскрипцию:\n"+editIng.value)).toLowerCase();
}
