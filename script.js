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
 hunting:"Охота", danger:"Опасность",
 thermal:"Тепловизор", orientation:"Ориентирование",
 weather:"Погода", emotions:"Эмоции",
 health:"Здоровье", help:"Помощь",
 commands:"Команды", tools:"Инструменты",
 animals:"Животные", time:"Время",
 numbers:"Числа", colors:"Цвета",
 money:"Деньги", shop:"Магазин",
 city:"Город", village:"Деревня",
 guests:"Гости", communication:"Общение",
 work:"Работа", misc:"Разное"
};

let currentCategory = null;
let currentData = null;
let allPhrases = [];
let currentView = "category";

/* ================= GLOBAL ================= */

window.adminMode = false;
window.githubToken = localStorage.getItem("githubToken");

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();
  await preloadAllCategories();

  if (githubToken) {
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
    document.getElementById("download-zip").classList.remove("hidden");
  }
};

/* ================= CATEGORIES ================= */

function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  categories.forEach(cat=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryTitles[cat]||cat;
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentView="category";
  currentCategory=cat;
  document.getElementById("content-title").textContent =
    categoryTitles[cat] || cat;

  const r = await fetch(`categories/${cat}.json`);
  currentData = await r.json();
  renderList(currentData.items, cat);
}

/* ================= RENDER (ЕДИНЫЙ) ================= */

function renderList(items, forcedCategory=null){
  const content=document.getElementById("content");
  content.innerHTML="";

  items.forEach((item,i)=>{
    const cat = forcedCategory || item.category;
    const file = normalizePron(item.pron)+".mp3";
    const audioPath = `audio/${cat}/${file}`;

    const div=document.createElement("div");
    div.className="phrase";
    div.innerHTML=`
      <p><b>ING:</b> ${item.ing||""}</p>
      <p><b>RU:</b> ${item.ru||""}</p>
      <p><b>PRON:</b> ${item.pron||""}</p>
      <i>${categoryTitles[cat]}</i><br>

      <button id="play-${i}" disabled
        onclick="playAudio('${cat}','${file}')">▶</button>
      <span id="ai-${i}">⚪</span>

      ${adminMode?`
        <button onclick="startRecording('${cat}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      `:""}
    `;
    content.appendChild(div);

    checkAudio(i, audioPath);
  });
}

/* ================= AUDIO ================= */

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио недоступно"));
}

function checkAudio(i,path){
  fetch(path,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        document.getElementById(`ai-${i}`).textContent="🟢";
        document.getElementById(`play-${i}`).disabled=false;
      }
    });
}

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* ================= SEARCH ================= */

async function preloadAllCategories(){
  allPhrases=[];
  for(const cat of categories){
    try{
      const r=await fetch(`categories/${cat}.json`);
      const d=await r.json();
      d.items.forEach(it=>{
        allPhrases.push({...it, category:cat});
      });
    }catch{}
  }
}

document.getElementById("search-btn").onclick = ()=>{
  const q=document.getElementById("global-search").value.toLowerCase().trim();
  if(!q) return;

  currentView="search";
  document.getElementById("content-title").textContent="Поиск: "+q;

  const res = allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  );

  renderList(res);
};

/* ================= ZIP ================= */

function downloadZip(){
  window.open(
    "https://github.com/ganizhevAmirkhan/ingush-phrasebook/archive/refs/heads/main.zip",
    "_blank"
  );
}
