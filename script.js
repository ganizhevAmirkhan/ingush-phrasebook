const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

const categoryNames = {
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

let currentCategory = null;
let currentData = null;
let allPhrases = [];

window.onload = async ()=>{
  loadCategories();
  await preloadAllCategories();
};

/* ========== КАТЕГОРИИ ========== */
function loadCategories(){
  const list=document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(cat=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryNames[cat] || cat;
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory=cat;
  document.getElementById("content-title").textContent=categoryNames[cat];
  const r=await fetch(`categories/${cat}.json`);
  currentData=await r.json();
  renderPhrases();
}

/* ========== ОТОБРАЖЕНИЕ ФРАЗ ========== */
function renderPhrases(){
  const c=document.getElementById("content");
  c.innerHTML="";
  currentData.items.forEach((it,i)=>{
    drawPhrase(it, currentCategory, i, c);
  });
}

function drawPhrase(it, cat, i, container){
  const file=normalizePron(it.pron)+".mp3";
  const d=document.createElement("div");
  d.className="phrase";
  d.innerHTML=`
    <p><b>ING:</b> ${it.ing}</p>
    <p><b>RU:</b> ${it.ru}</p>
    <p><b>PRON:</b> ${it.pron}</p>
    <p><i>${categoryNames[cat]}</i></p>
    <button onclick="playAudio('${cat}','${file}')">🔊</button>
  `;
  container.appendChild(d);
}

/* ========== АУДИО ========== */
function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио ещё не доступно"));
}

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* ========== ЗАГРУЗКА ВСЕХ ФРАЗ ========== */
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

/* ========== 🔍 ПОИСК ========== */
const input=document.getElementById("global-search");
const box=document.getElementById("search-results");
const btn=document.getElementById("search-btn");

input.oninput=()=>{
  const q=input.value.toLowerCase().trim();
  box.innerHTML="";
  if(q.length<2){ box.classList.add("hidden"); return; }

  allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).slice(0,20).forEach(p=>{
    const d=document.createElement("div");
    d.className="search-item";
    d.innerHTML=`<b>${p.ru}</b> <small>${categoryNames[p.category]}</small>`;
    d.onclick=()=>{
      showSingleResult(p);
      box.classList.add("hidden");
    };
    box.appendChild(d);
  });

  box.classList.remove("hidden");
};

btn.onclick=()=>{
  const q=input.value.toLowerCase().trim();
  if(!q) return;
  box.classList.add("hidden");

  const c=document.getElementById("content");
  document.getElementById("content-title").textContent=`Результаты поиска`;
  c.innerHTML="";

  allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).forEach(p=>{
    drawPhrase(p, p.category, 0, c);
  });
};

function showSingleResult(p){
  const c=document.getElementById("content");
  document.getElementById("content-title").textContent="Результат";
  c.innerHTML="";
  drawPhrase(p, p.category, 0, c);
}
