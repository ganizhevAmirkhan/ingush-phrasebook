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

let allPhrases = [];          // 🔴 ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ
let phraseIndex = {};         // id -> category
let currentView = "category"; // category | search
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
const b64EncodeUnicode = str => btoa(unescape(encodeURIComponent(str)));

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
  renderCategory();
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

    <button id="pb-${item.id}" disabled onclick="playAudio('${item.category}','${file}','${item.id}')">▶</button>
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
  const base = file.replace(/\.(mp3|webm)$/i,"");
  for(const ext of ["mp3","webm"]){
    const url = `audio/${cat}/${base}.${ext}?v=${Date.now()}`;
    const r = await fetch(url,{method:"HEAD"}).catch(()=>null);
    if(r && r.ok){
      new Audio(url).play();
      return;
    }
  }
  alert("Аудио не найдено");
}

function checkAudio(cat,file,id){
  const base = file.replace(/\.(mp3|webm)$/i,"");
  (async()=>{
    for(const ext of ["mp3","webm"]){
      const r = await fetch(`audio/${cat}/${base}.${ext}`,{method:"HEAD"}).catch(()=>null);
      if(r && r.ok){
        document.getElementById(`ai-${id}`).textContent="🟢";
        document.getElementById(`pb-${id}`).disabled=false;
        return;
      }
    }
  })();
}

/* ================= SEARCH ================= */
function setupSearchSuggest(){
  const input = document.getElementById("global-search");
  const box   = document.getElementById("search-results");

  input.oninput = ()=>{
    const q = low(input.value);
    box.innerHTML="";
    if(q.length<2){box.classList.add("hidden");return;}

    allPhrases.filter(p=>
      low(p.ru).includes(q)||low(p.ing).includes(q)||low(p.pron).includes(q)
    ).slice(0,20).forEach(p=>{
      const d=document.createElement("div");
      d.textContent=`${p.ru} — ${categoryTitles[p.category]}`;
      d.onclick=()=>{input.value=p.ru;doSearch();};
      box.appendChild(d);
    });
    box.classList.remove("hidden");
  };

  document.getElementById("search-btn").onclick = doSearch;
}

function doSearch(){
  const q = safe(document.getElementById("global-search").value);
  if(!q) return;
  lastSearchQuery=q;
  currentView="search";
  document.getElementById("content-title").textContent="Поиск: "+q;
  rebuildSearchResults();
}

function rebuildSearchResults(){
  const q=low(lastSearchQuery);
  searchResults=allPhrases.filter(p=>
    low(p.ru).includes(q)||low(p.ing).includes(q)||low(p.pron).includes(q)
  );
  renderSearch();
}

/* ================= CRUD ================= */
async function addPhrase(cat){
  const ru=prompt("Русский:");
  const ing=prompt("Ингушский:");
  const pron=prompt("Произношение:");
  if(!ru||!ing||!pron) return;

  const id=genId();
  const item={id,ru,ing,pron,audio:`${id}.mp3`,category:cat};

  const d=await loadCategoryData(cat);
  d.items.push(item);
  await saveCategoryData(cat,d);

  allPhrases.push(item);
  phraseIndex[id]=cat;

  renderCurrentView();
}

async function editById(id){
  const p=allPhrases.find(x=>x.id===id);
  if(!p) return;

  const ru=prompt("Русский:",p.ru);
  const ing=prompt("Ингушский:",p.ing);
  const pron=prompt("Произношение:",p.pron);
  if(ru===null||ing===null||pron===null) return;

  p.ru=ru; p.ing=ing; p.pron=pron;

  const d=await loadCategoryData(p.category);
  Object.assign(d.items.find(x=>x.id===id),p);
  await saveCategoryData(p.category,d);

  renderCurrentView();
}

async function deleteById(id){
  if(!confirm("Удалить?")) return;
  const cat=phraseIndex[id];
  const d=await loadCategoryData(cat);
  d.items=d.items.filter(x=>x.id!==id);
  await saveCategoryData(cat,d);

  allPhrases=allPhrases.filter(x=>x.id!==id);
  renderCurrentView();
}

/* ================= RECORD ================= */
async function recordById(id){
  const p=allPhrases.find(x=>x.id===id);
  if(!p) return;
  startRecording(p.category,id);
}

window.onAudioUploaded = async function(cat,id,file){
  const p=allPhrases.find(x=>x.id===id);
  if(p) p.audio=file;

  const d=await loadCategoryData(cat);
  const it=d.items.find(x=>x.id===id);
  if(it){it.audio=file;await saveCategoryData(cat,d);}

  renderCurrentView();
};

/* ================= DATA LOAD ================= */
async function loadCategoryData(cat){
  const r=await fetch(`categories/${cat}.json`);
  return await r.json();
}

async function saveCategoryData(cat,data){
  const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;
  const sha=(await fetch(url,{headers:{Authorization:`token ${githubToken}`}}).then(r=>r.json())).sha;

  await fetch(url,{
    method:"PUT",
    headers:{Authorization:`token ${githubToken}`,"Content-Type":"application/json"},
    body:JSON.stringify({message:`Update ${cat}`,content:b64EncodeUnicode(JSON.stringify(data,null,2)),sha})
  });
}

async function preloadAllCategories(){
  allPhrases=[]; phraseIndex={};
  for(const cat of categories){
    try{
      const d=await loadCategoryData(cat);
      d.items.forEach(it=>{
        it.category=cat;
        allPhrases.push(it);
        phraseIndex[it.id]=cat;
      });
    }catch{}
  }
}
