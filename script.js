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
let searchResults = [];
let currentView = "category";

let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();
  await preloadAllCategories();

  if (githubToken) {
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
    document.getElementById("download-zip").classList.remove("hidden");
    document.getElementById("admin-logout").classList.remove("hidden");
  }
};

/* ================= CATEGORIES ================= */

function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  categories.forEach(cat=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryTitles[cat];
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentView="category";
  currentCategory=cat;

  document.getElementById("content-title").textContent =
    categoryTitles[cat];

  const r=await fetch(`categories/${cat}.json`);
  currentData=await r.json();

  renderCategory();
}

/* ================= RENDER ================= */

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

function renderPhrase(item,i,cat){
  const file=normalizePron(item.pron)+".mp3";

  return `
  <div class="phrase">
    <p><b>ING:</b> ${item.ing}</p>
    <p><b>RU:</b> ${item.ru}</p>
    <p><b>PRON:</b> ${item.pron}</p>
    <i>${categoryTitles[cat]}</i><br>

    <button onclick="playAudio('${cat}','${file}')">▶</button>
    <span id="ai-${cat}-${i}">⚪</span>

    ${adminMode ? `
      <button onclick="startRecording('${cat}','${item.pron}')">🎤</button>
      <button onclick="editPhrase('${cat}',${i})">✏</button>
      <button onclick="deletePhrase('${cat}',${i})">🗑</button>
    ` : ""}
  </div>`;
}

function renderCategory(){
  const c=document.getElementById("content");
  c.innerHTML="";

  currentData.items.forEach((it,i)=>{
    c.insertAdjacentHTML(
      "beforeend",
      renderPhrase(it,i,currentCategory)
    );
    checkAudio(
      `${currentCategory}-${i}`,
      normalizePron(it.pron)+".mp3"
    );
  });

  if(adminMode){
    const btn=document.createElement("button");
    btn.textContent="➕ Добавить фразу";
    btn.onclick=()=>addPhrase(currentCategory);
    c.appendChild(btn);
  }
}

function renderSearch(){
  const c=document.getElementById("content");
  c.innerHTML="";

  searchResults.forEach((p,i)=>{
    c.insertAdjacentHTML(
      "beforeend",
      renderPhrase(p,i,p.category)
    );
    checkAudio(
      `${p.category}-${i}`,
      normalizePron(p.pron)+".mp3"
    );
  });
}

function renderCurrentView(){
  currentView==="search" ? renderSearch() : renderCategory();
}

/* ================= AUDIO ================= */

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио нет"));
}

function checkAudio(id,file){
  const cat=id.split("-")[0];
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        const el=document.getElementById(`ai-${id}`);
        if(el) el.textContent="🟢";
      }
    });
}

/* ================= ADMIN ================= */

function adminLogin(){
  const t=document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");

  githubToken=t;
  adminMode=true;
  localStorage.setItem("githubToken",t);

  document.getElementById("admin-status").textContent="✓ Админ";
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
    "https://github.com/ganizhevAmirkhan/ingush-phrasebook/archive/refs/heads/main.zip",
    "_blank"
  );
}

/* ================= CRUD ФРАЗ ================= */

function addPhrase(cat){
  const ru=prompt("Русский:");
  const ing=prompt("Ингушский:");
  const pron=prompt("Произношение (латиница):");

  if(!ru||!ing||!pron) return;

  currentData.items.push({ru,ing,pron});
  saveCategory(cat);
}

function editPhrase(cat,i){
  const it=currentData.items[i];

  it.ru=prompt("Русский:",it.ru);
  it.ing=prompt("Ингушский:",it.ing);
  it.pron=prompt("Произношение:",it.pron);

  saveCategory(cat);
}

function deletePhrase(cat,i){
  if(!confirm("Удалить фразу?")) return;
  currentData.items.splice(i,1);
  saveCategory(cat);
}

/* ================= SAVE TO GITHUB ================= */

async function saveCategory(cat){
  if(!githubToken) return alert("Нет GitHub Token");

  const path=`categories/${cat}.json`;
  const url=`https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/${path}`;

  let sha=null;
  const check=await fetch(url,{
    headers:{Authorization:`token ${githubToken}`}
  });
  if(check.ok) sha=(await check.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Update ${cat}`,
      content:btoa(unescape(
        encodeURIComponent(JSON.stringify(currentData,null,2))
      )),
      sha
    })
  });

  await preloadAllCategories();
  renderCurrentView();
}

/* ================= SEARCH ================= */

async function preloadAllCategories(){
  allPhrases=[];
  for(const cat of categories){
    try{
      const r=await fetch(`categories/${cat}.json`);
      const d=await r.json();
      d.items.forEach(it=>{
        allPhrases.push({...it,category:cat});
      });
    }catch{}
  }
}

const sInput=document.getElementById("global-search");
const sBox=document.getElementById("search-results");

function hideSuggestions(){
  sBox.classList.add("hidden");
  sBox.innerHTML="";
}

sInput.oninput=()=>{
  const q=sInput.value.toLowerCase().trim();
  sBox.innerHTML="";

  if(q.length<2){
    hideSuggestions();
    return;
  }

  allPhrases
    .filter(p=>
      (p.ru||"").toLowerCase().includes(q) ||
      (p.ing||"").toLowerCase().includes(q) ||
      (p.pron||"").toLowerCase().includes(q)
    )
    .slice(0,20)
    .forEach(p=>{
      const d=document.createElement("div");
      d.className="search-item";
      d.textContent=`${p.ru} — ${categoryTitles[p.category]}`;
      d.onclick=()=>{
        sInput.value=p.ru;
        hideSuggestions();
        doSearch();
      };
      sBox.appendChild(d);
    });

  sBox.classList.remove("hidden");
};

document.getElementById("search-btn").onclick=doSearch;

function doSearch(){
  const q=sInput.value.toLowerCase().trim();
  if(!q) return;

  currentView="search";
  hideSuggestions();

  document.getElementById("content-title").textContent =
    "Поиск: "+sInput.value;

  searchResults=allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  );

  renderSearch();
}

document.addEventListener("click",e=>{
  if(!e.target.closest(".search-wrap")){
    hideSuggestions();
  }
});
