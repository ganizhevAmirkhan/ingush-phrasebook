/* ================= CONFIG ================= */

const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-phrasebook";

let githubToken = localStorage.getItem("gh_token") || null;
let isAdmin = false;

/* ====== КАТЕГОРИИ (РОВНО ТВОЙ СПИСОК) ====== */

const categories = [
  "animals","basic_phrases","city","colors","commands","communication",
  "conversation","danger","drinks","emotions","family","food","greetings",
  "guests","health","help","home","hunting","misc","money","numbers",
  "orientation","personal_info","shop","thermal","time","tools",
  "transport","travel","village","weather","work"
];

/* ====== НАЗВАНИЯ ДЛЯ МЕНЮ ====== */

const categoryTitles = {
  greetings:"Приветствия",
  basic_phrases:"Базовые фразы",
  personal_info:"Личная информация",
  family:"Семья",
  home:"Дом",
  food:"Еда",
  drinks:"Напитки",
  travel:"Путешествия",
  transport:"Транспорт",
  hunting:"Охота",
  danger:"Опасность",
  thermal:"Тепловизор",
  orientation:"Ориентирование",
  weather:"Погода",
  emotions:"Эмоции",
  health:"Здоровье",
  help:"Помощь",
  commands:"Команды",
  tools:"Инструменты",
  animals:"Животные",
  time:"Время",
  numbers:"Числа",
  colors:"Цвета",
  money:"Деньги",
  shop:"Магазин",
  city:"Город",
  village:"Деревня",
  guests:"Гости",
  communication:"Общение",
  conversation:"Разговор",
  misc:"Разное",
  work:"Работа"
};

/* ================= STATE ================= */

let phraseIndex = {};   // id -> category
let currentCategory = null;
let currentData = null;

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async ()=>{
  renderCategoriesMenu();
  await preloadAllCategories();
});

/* ================= MENU ================= */

function renderCategoriesMenu(){
  const menu = document.getElementById("categories");
  menu.innerHTML = "";
  categories.forEach(cat=>{
    const b = document.createElement("button");
    b.textContent = categoryTitles[cat] || cat;
    b.onclick = ()=>openCategory(cat);
    menu.appendChild(b);
  });
}

/* ================= LOAD ================= */

async function loadCategoryData(cat){
  const r = await fetch(`categories/${cat}.json`);
  if(!r.ok) throw new Error("404");
  return await r.json();
}

async function preloadAllCategories(){
  phraseIndex = {};
  for(const cat of categories){
    try{
      const d = await loadCategoryData(cat);
      d.items.forEach(it=>{
        if(!it.audio) it.audio = it.id + ".webm";
        phraseIndex[it.id] = cat;
      });
    }catch{}
  }
}

/* ================= OPEN ================= */

async function openCategory(cat){
  currentCategory = cat;
  currentData = await loadCategoryData(cat);
  renderList(currentData.items);
}

/* ================= RENDER ================= */

function renderList(items){
  const box = document.getElementById("content");
  box.innerHTML = "";

  items.forEach(it=>{
    const d = document.createElement("div");
    d.className = "card";

    d.innerHTML = `
      <b>ING:</b> ${it.ing}<br>
      <b>RU:</b> ${it.ru}<br>
      <b>PRON:</b> ${it.pron}<br>
      <small>${categoryTitles[currentCategory]}</small><br>

      <button onclick="playAudio('${currentCategory}','${it.audio}')">▶</button>
      <span id="ai-${it.audio}">⚪</span>

      ${isAdmin ? `
        <button onclick="startRecording('${currentCategory}','${it.id}')">🎤</button>
        <button onclick="editById('${it.id}')">✏</button>
        <button onclick="deleteById('${it.id}')">🗑</button>
      ` : ""}
    `;

    box.appendChild(d);
    checkAudio(currentCategory,it.audio);
  });

  if(isAdmin){
    const add = document.createElement("button");
    add.textContent = "+ Добавить фразу";
    add.onclick = addPhrase;
    box.appendChild(add);
  }
}

/* ================= AUDIO ================= */

function playAudio(cat,file){
  const a = new Audio(`audio/${cat}/${file}?v=${Date.now()}`);
  a.onerror = ()=>alert("Аудио не воспроизводится");
  a.play();
}

function checkAudio(cat,file){
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      const el = document.getElementById(`ai-${file}`);
      if(el) el.textContent = r.ok ? "🟢" : "⚪";
    });
}

/* ================= SEARCH ================= */

async function searchAll(q){
  q = q.toLowerCase();
  const res = [];

  for(const cat of categories){
    try{
      const d = await loadCategoryData(cat);
      d.items.forEach(it=>{
        if(
          it.ru.toLowerCase().includes(q) ||
          it.ing.toLowerCase().includes(q) ||
          it.pron.toLowerCase().includes(q)
        ){
          res.push({...it,_cat:cat});
        }
      });
    }catch{}
  }

  renderSearch(res);
}

function renderSearch(items){
  const box = document.getElementById("content");
  box.innerHTML = "<h3>Результаты поиска</h3>";

  items.forEach(it=>{
    const d = document.createElement("div");
    d.className = "card";

    d.innerHTML = `
      <b>ING:</b> ${it.ing}<br>
      <b>RU:</b> ${it.ru}<br>
      <b>PRON:</b> ${it.pron}<br>
      <small>${categoryTitles[it._cat]}</small><br>

      <button onclick="playAudio('${it._cat}','${it.audio}')">▶</button>
      <span id="ai-${it.audio}">⚪</span>

      ${isAdmin ? `
        <button onclick="startRecording('${it._cat}','${it.id}')">🎤</button>
        <button onclick="editById('${it.id}')">✏</button>
        <button onclick="deleteById('${it.id}')">🗑</button>
      ` : ""}
    `;

    box.appendChild(d);
    checkAudio(it._cat,it.audio);
  });
}

/* ================= ADMIN ================= */

function loginAdmin(){
  const t = prompt("GitHub Token:");
  if(!t) return;
  githubToken = t;
  localStorage.setItem("gh_token",t);
  isAdmin = true;
  alert("Админ включён");
}

function logoutAdmin(){
  isAdmin = false;
  alert("Выход из админа");
}

/* ================= CRUD ================= */

async function editById(id){
  const cat = phraseIndex[id];
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryData(cat);
  const it = d.items.find(x=>x.id===id);
  if(!it) return;

  it.ru = prompt("RU",it.ru);
  it.ing = prompt("ING",it.ing);
  it.pron = prompt("PRON",it.pron);

  await saveCategory(cat,d);
  openCategory(cat);
}

async function deleteById(id){
  if(!confirm("Удалить?")) return;
  const cat = phraseIndex[id];
  const d = await loadCategoryData(cat);
  d.items = d.items.filter(x=>x.id!==id);
  await saveCategory(cat,d);
  openCategory(cat);
}

async function addPhrase(){
  const ru = prompt("RU");
  const ing = prompt("ING");
  const pron = prompt("PRON");
  if(!ru||!ing) return;

  const id = "f_" + Date.now();
  currentData.items.push({
    id,ru,ing,pron,
    audio:id+".webm"
  });

  await saveCategory(currentCategory,currentData);
  openCategory(currentCategory);
}

/* ================= SAVE ================= */

async function saveCategory(cat,data){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;
  const r = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  const j = await r.json();

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Update ${cat}`,
      content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
      sha:j.sha
    })
  });

  await preloadAllCategories();
}
