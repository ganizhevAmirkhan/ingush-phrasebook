/***********************
 * НАСТРОЙКИ
 ***********************/
const categories = [
  { id:"greetings", label:"Приветствия" },
  { id:"basic_phrases", label:"Основные фразы" },
  { id:"personal_info", label:"Личные данные" },
  { id:"family", label:"Семья" },
  { id:"home", label:"Дом" },
  { id:"food", label:"Еда" },
  { id:"drinks", label:"Питьё" },
  { id:"travel", label:"Путешествия" },
  { id:"trconst categories = [
  {id:"greetings",ru:"Приветствия"},
  {id:"basic_phrases",ru:"Основные фразы"},
  {id:"personal_info",ru:"Личные данные"},
  {id:"family",ru:"Семья"},
  {id:"home",ru:"Дом"},
  {id:"food",ru:"Еда"},
  {id:"drinks",ru:"Питьё"},
  {id:"travel",ru:"Путешествия"},
  {id:"transport",ru:"Транспорт"},
  {id:"hunting",ru:"Охота"},
  {id:"danger",ru:"Опасность"},
  {id:"thermal",ru:"Тепловизор"},
  {id:"orientation",ru:"Ориентация"},
  {id:"weather",ru:"Погода"},
  {id:"emotions",ru:"Эмоции"},
  {id:"health",ru:"Здоровье"},
  {id:"help",ru:"Помощь"},
  {id:"commands",ru:"Команды"},
  {id:"tools",ru:"Инструменты"},
  {id:"animals",ru:"Животные"},
  {id:"time",ru:"Время"},
  {id:"numbers",ru:"Числа"}
];

let currentCategory = null;
let currentData = null;

window.onload = loadCategories;

function loadCategories(){
  const list=document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(c=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=c.ru;
    d.onclick=()=>loadCategory(c.id,c.ru);
    list.appendChild(d);
  });
}

async function loadCategory(id,ru){
  currentCategory=id;
  document.getElementById("content-title").textContent=ru;
  const res=await fetch(`categories/${id}.json`);
  currentData=await res.json();
  renderPhrases(currentData.items);
}

function renderPhrases(items){
  const content=document.getElementById("content");
  content.innerHTML="";

  items.forEach((item,i)=>{
    const file=normalizePron(item.pron)+".mp3";
    const div=document.createElement("div");
    div.className="phrase";
    div.innerHTML=`
      <b>RU:</b> ${item.ru}<br>
      <b>ING:</b> ${item.ing}<br>
      <b>PRON:</b> ${item.pron}<br>

      <button onclick="playAudio('${currentCategory}','${file}')">🔊</button>
      <span class="audio-indicator" id="ai-${currentCategory}-${i}">⚪</span>

      ${adminMode?`
        <button onclick="startRecording('${currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      `:""}
    `;
    content.appendChild(div);
    checkAudio(currentCategory,i,file);
  });

  if(adminMode){
    const add=document.createElement("button");
    add.textContent="➕ Добавить фразу";
    add.onclick=addPhrase;
    content.appendChild(add);

    const dl=document.createElement("button");
    dl.textContent="💾 Скачать категорию";
    dl.onclick=downloadCategory;
    content.appendChild(dl);
  }
}

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио не найдено"));
}

function checkAudio(cat,i,file){
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        const el=document.getElementById(`ai-${cat}-${i}`);
        if(el) el.textContent="🟢";
      }
    });
}

function normalizePron(p){
  return p.toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* 🔍 ГЛАВНОЕ: ПОИСК */
async function searchPhrases(){
  const q=document.getElementById("search-input").value.toLowerCase();
  if(!q) return;

  // 🔹 Если категория выбрана — ищем в ней
  if(currentCategory && currentData){
    const filtered=currentData.items.filter(it =>
      `${it.ru} ${it.ing} ${it.pron}`.toLowerCase().includes(q)
    );
    renderPhrases(filtered);
    return;
  }

  // 🔹 Если категория НЕ выбрана — ищем по всем
  document.getElementById("content-title").textContent="Результаты поиска";
  const content=document.getElementById("content");
  content.innerHTML="";

  for(const c of categories){
    try{
      const res=await fetch(`categories/${c.id}.json`);
      const data=await res.json();

      data.items.forEach(item=>{
        if(`${item.ru} ${item.ing} ${item.pron}`.toLowerCase().includes(q)){
          const file=normalizePron(item.pron)+".mp3";
          const div=document.createElement("div");
          div.className="phrase";
          div.innerHTML=`
            <b>${c.ru}</b><br>
            <b>RU:</b> ${item.ru}<br>
            <b>ING:</b> ${item.ing}<br>
            <b>PRON:</b> ${item.pron}<br>
            <button onclick="playAudio('${c.id}','${file}')">🔊</button>
          `;
          content.appendChild(div);
        }
      });
    }catch{}
  }
}

function downloadCategory(){
  const blob=new Blob(
    [JSON.stringify(currentData,null,2)],
    {type:"application/json"}
  );
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${currentCategory}.json`;
  a.click();
}
ansport", label:"Транспорт" },
  { id:"hunting", label:"Охота" },
  { id:"danger", label:"Опасность" },
  { id:"thermal", label:"Тепловизор" },
  { id:"orientation", label:"Ориентация" },
  { id:"weather", label:"Погода" },
  { id:"emotions", label:"Эмоции" },
  { id:"health", label:"Здоровье" },
  { id:"help", label:"Помощь" },
  { id:"commands", label:"Команды" },
  { id:"tools", label:"Инструменты" },
  { id:"animals", label:"Животные" },
  { id:"time", label:"Время" },
  { id:"numbers", label:"Числа" }
];

let currentCategory = null;
let currentData = null;
let adminMode = false;

/***********************
 * ЗАГРУЗКА КАТЕГОРИЙ
 ***********************/
window.onload = () => {
  renderCategories();
};

function renderCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(c => {
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = c.label;
    d.onclick = () => loadCategory(c.id, c.label);
    list.appendChild(d);
  });
}

/***********************
 * ЗАГРУЗКА КАТЕГОРИИ
 ***********************/
async function loadCategory(catId, label) {
  currentCategory = catId;
  document.getElementById("content-title").textContent = label;

  const res = await fetch(`categories/${catId}.json`);
  currentData = await res.json();
  renderPhrases(currentData.items);
}

/***********************
 * РЕНДЕР ФРАЗ
 ***********************/
function renderPhrases(items) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  items.forEach((item, i) => {
    const file = normalizePron(item.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${currentCategory}','${file}')">🔊</button>
      <span class="audio-indicator" id="ai-${currentCategory}-${i}">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;

    content.appendChild(div);

    // 🔍 проверка аудио
    checkAudio(currentCategory, i, file);
  });

  if (adminMode) {
    const addBtn = document.createElement("button");
    addBtn.textContent = "➕ Добавить фразу";
    addBtn.onclick = addPhrase;
    content.appendChild(addBtn);
  }
}

/***********************
 * ▶️ ПРОИГРЫВАНИЕ
 ***********************/
function playAudio(cat, file) {
  const audio = new Audio(`audio/${cat}/${file}?v=${Date.now()}`);
  audio.play().catch(() => alert("Аудио ещё не доступно"));
}

/***********************
 * 🟢 ПРОВЕРКА АУДИО (FIX CACHE)
 ***********************/
function checkAudio(cat, i, file) {
  const url = `audio/${cat}/${file}?v=${Date.now()}`;

  fetch(url, { method: "HEAD" })
    .then(r => {
      if (r.ok) {
        const el = document.getElementById(`ai-${cat}-${i}`);
        if (el) el.textContent = "🟢";
      }
    })
    .catch(() => {});
}

/***********************
 * 🔎 ПОИСК
 ***********************/
function searchPhrases() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  if (!q) return;

  // если категория выбрана — ищем в ней
  if (currentData) {
    const filtered = currentData.items.filter(p =>
      p.ru.toLowerCase().includes(q) ||
      p.ing.toLowerCase().includes(q) ||
      p.pron.toLowerCase().includes(q)
    );
    renderPhrases(filtered);
    return;
  }

  // иначе — поиск по ВСЕМ категориям
  searchAllCategories(q);
}

async function searchAllCategories(q) {
  const content = document.getElementById("content");
  content.innerHTML = "<p>Поиск…</p>";

  let results = [];

  for (const c of categories) {
    const res = await fetch(`categories/${c.id}.json`);
    const data = await res.json();

    data.items.forEach(p => {
      if (
        p.ru.toLowerCase().includes(q) ||
        p.ing.toLowerCase().includes(q) ||
        p.pron.toLowerCase().includes(q)
      ) {
        results.push({ ...p, _cat: c });
      }
    });
  }

  content.innerHTML = "";
  results.forEach((p, i) => {
    const file = normalizePron(p.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <p><b>${p._cat.label}</b></p>
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>PRON:</b> ${p.pron}</p>
      <button onclick="playAudio('${p._cat.id}','${file}')">🔊</button>
    `;
    content.appendChild(div);
  });

  if (!results.length) {
    content.innerHTML = "<p>Ничего не найдено</p>";
  }
}

/***********************
 * 🛠 АДМИН
 ***********************/
function adminLogin() {
  const token = document.getElementById("gh-token").value.trim();
  if (!token) return alert("Введите GitHub Token");

  localStorage.setItem("gh_token", token);
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  if (currentData) renderPhrases(currentData.items);
}

function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON (латиница):");
  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  saveCategory();
}

function editPhrase(i) {
  const p = currentData.items[i];
  p.ru = prompt("RU:", p.ru);
  p.ing = prompt("ING:", p.ing);
  p.pron = prompt("PRON:", p.pron);
  saveCategory();
}

function deletePhrase(i) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(i, 1);
  saveCategory();
}

/***********************
 * 💾 СОХРАНЕНИЕ
 ***********************/
async function saveCategory() {
  const token = localStorage.getItem("gh_token");
  if (!token) return alert("Нет GitHub Token");

  const path = `categories/${currentCategory}.json`;
  const url = `https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;
  const check = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  if (check.ok) sha = (await check.json()).sha;

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Update ${currentCategory}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentData, null, 2)))),
      sha
    })
  });

  renderPhrases(currentData.items);
}

/***********************
 * 🔤 НОРМАЛИЗАЦИЯ
 ***********************/
function normalizePron(p) {
  return p
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

