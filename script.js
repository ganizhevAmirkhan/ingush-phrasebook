/* ================== CONFIG ================== */

const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-phrasebook";

let githubToken = localStorage.getItem("gh_token") || null;
let isAdmin = false;

const categories = [
  "greetings","basic_phrases","family","home","food","drinks",
  "travel","transport","health","help","commands","animals",
  "time","numbers","colors","weather","emotions","danger","misc"
];

/* ================== STATE ================== */

let currentCategory = null;
let currentData = null;
let phraseIndex = {}; // id -> category

/* ================== INIT ================== */

document.addEventListener("DOMContentLoaded", async () => {
  await preloadAllCategories();
});

/* ================== LOAD ================== */

async function loadCategoryData(category){
  const r = await fetch(`categories/${category}.json`);
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

/* ================== FIND CATEGORY ================== */

async function findCategoryById(id){
  if(phraseIndex[id]) return phraseIndex[id];

  for(const cat of categories){
    try{
      const d = await loadCategoryData(cat);
      if(d.items.some(i => i.id === id)){
        phraseIndex[id] = cat;
        return cat;
      }
    }catch{}
  }
  return null;
}

/* ================== RENDER ================== */

async function openCategory(category){
  currentCategory = category;
  currentData = await loadCategoryData(category);
  renderList(currentData.items);
}

function renderList(items){
  const box = document.getElementById("content");
  box.innerHTML = "";

  items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <b>ING:</b> ${it.ing}<br>
      <b>RU:</b> ${it.ru}<br>
      <b>PRON:</b> ${it.pron}<br>
      <small>${currentCategory}</small><br>

      <button onclick="playAudio('${currentCategory}','${it.audio}')">▶</button>
      <span id="ai-${it.audio}">⚪</span>

      ${isAdmin ? `
        <button onclick="startRecording('${currentCategory}','${it.id}')">🎤</button>
        <button onclick="editById('${it.id}')">✏</button>
        <button onclick="deleteById('${it.id}')">🗑</button>
      ` : ""}
    `;

    box.appendChild(div);
    checkAudio(currentCategory, it.audio);
  });

  if(isAdmin){
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Добавить фразу";
    addBtn.onclick = addPhrase;
    box.appendChild(addBtn);
  }
}

/* ================== AUDIO ================== */

function playAudio(category, file){
  const a = new Audio(`audio/${category}/${file}?v=${Date.now()}`);
  a.onerror = () => alert("Аудио не воспроизводится");
  a.play();
}

function checkAudio(category, file){
  fetch(`audio/${category}/${file}`,{method:"HEAD"})
    .then(r=>{
      const el = document.getElementById(`ai-${file}`);
      if(el) el.textContent = r.ok ? "🟢" : "⚪";
    });
}

/* ================== SEARCH ================== */

async function searchAll(q){
  q = q.toLowerCase();
  const results = [];

  for(const cat of categories){
    try{
      const d = await loadCategoryData(cat);
      d.items.forEach(it=>{
        if(
          it.ru.toLowerCase().includes(q) ||
          it.ing.toLowerCase().includes(q) ||
          it.pron.toLowerCase().includes(q)
        ){
          results.push({...it, _cat: cat});
        }
      });
    }catch{}
  }

  renderSearch(results);
}

function renderSearch(items){
  const box = document.getElementById("content");
  box.innerHTML = "<h3>Результаты поиска</h3>";

  items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <b>ING:</b> ${it.ing}<br>
      <b>RU:</b> ${it.ru}<br>
      <b>PRON:</b> ${it.pron}<br>
      <small>${it._cat}</small><br>

      <button onclick="playAudio('${it._cat}','${it.audio}')">▶</button>
      <span id="ai-${it.audio}">⚪</span>

      ${isAdmin ? `
        <button onclick="startRecording('${it._cat}','${it.id}')">🎤</button>
        <button onclick="editById('${it.id}')">✏</button>
        <button onclick="deleteById('${it.id}')">🗑</button>
      ` : ""}
    `;
    box.appendChild(div);
    checkAudio(it._cat, it.audio);
  });
}

/* ================== ADMIN ================== */

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

/* ================== CRUD ================== */

async function editById(id){
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryData(cat);
  const it = d.items.find(x=>x.id===id);
  if(!it) return alert("Фраза не найдена");

  it.ru   = prompt("RU:",it.ru);
  it.ing  = prompt("ING:",it.ing);
  it.pron = prompt("PRON:",it.pron);

  await saveCategoryData(cat,d);
  await preloadAllCategories();

  if(currentCategory===cat){
    currentData = d;
    renderList(d.items);
  }
}

async function deleteById(id){
  if(!confirm("Удалить?")) return;
  const cat = await findCategoryById(id);
  if(!cat) return alert("Категория не найдена");

  const d = await loadCategoryData(cat);
  d.items = d.items.filter(x=>x.id!==id);

  await saveCategoryData(cat,d);
  await preloadAllCategories();

  if(currentCategory===cat){
    currentData = d;
    renderList(d.items);
  }
}

async function addPhrase(){
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON:");
  if(!ru||!ing) return;

  const id = "f_" + Date.now();
  currentData.items.push({
    id, ru, ing, pron,
    audio: id + ".webm"
  });

  await saveCategoryData(currentCategory,currentData);
  await preloadAllCategories();
  renderList(currentData.items);
}

/* ================== SAVE ================== */

async function saveCategoryData(category,data){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${category}.json`;

  const r = await fetch(url,{
    headers:{Authorization:`token ${githubToken}`}
  });
  const j = await r.json();

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Update ${category}`,
      content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
      sha:j.sha
    })
  });
}
