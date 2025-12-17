/*********** КАТЕГОРИИ ***********/
const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

const categoryRu = {
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
 work:"Работа",
 misc:"Разное"
};

let currentCategory=null;
let currentData=null;
let allPhrases=[];

/*********** ЗАГРУЗКА ***********/
window.onload = async ()=>{
  loadCategories();
  await preloadAllCategories();
};

/*********** КАТЕГОРИИ ***********/
function loadCategories(){
  const list=document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(cat=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryRu[cat]||cat;
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  hideSuggestions();
  currentCategory=cat;
  document.getElementById("content-title").textContent=categoryRu[cat];
  const r=await fetch(`categories/${cat}.json`);
  currentData=await r.json();
  renderPhrases();
}

/*********** ФРАЗЫ ***********/
function renderPhrases(){
  const c=document.getElementById("content");
  c.innerHTML="";
  currentData.items.forEach((it,i)=>{
    const f=normalizePron(it.pron)+".mp3";
    const d=document.createElement("div");
    d.className="phrase";
    d.innerHTML=`
      <p><b>ING:</b> ${it.ing}</p>
      <p><b>RU:</b> ${it.ru}</p>
      <p><b>PRON:</b> ${it.pron}</p>
      <p><i>${categoryRu[currentCategory]}</i></p>
      <button onclick="playAudio('${currentCategory}','${f}')">🔊</button>
    `;
    c.appendChild(d);
  });
}

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play();
}

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/*********** ПОИСК ***********/
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
  sBox.innerHTML="";
  sBox.classList.add("hidden");
}

/* выплывающие подсказки */
sInput.oninput=()=>{
  const q=sInput.value.trim().toLowerCase();
  sBox.innerHTML="";
  if(q.length<2){ hideSuggestions(); return; }

  allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).slice(0,15).forEach(p=>{
    const d=document.createElement("div");
    d.className="search-item";
    d.innerHTML=`${p.ru} — <small>${categoryRu[p.category]}</small>`;
    d.onclick=()=>{
      hideSuggestions();
      showSingleResult(p);
    };
    sBox.appendChild(d);
  });

  sBox.classList.remove("hidden");
};

/* показ одной фразы */
function showSingleResult(p){
  const c=document.getElementById("content");
  document.getElementById("content-title").textContent="Результат поиска";
  c.innerHTML=`
    <div class="phrase">
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>PRON:</b> ${p.pron}</p>
      <p><i>${categoryRu[p.category]}</i></p>
    </div>
  `;
}

/* кнопка поиск */
document.getElementById("search-btn").onclick=()=>{
  hideSuggestions();
  const q=sInput.value.trim().toLowerCase();
  if(!q) return;

  const c=document.getElementById("content");
  document.getElementById("content-title").textContent=`Поиск: ${sInput.value}`;
  c.innerHTML="";

  allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).forEach(p=>{
    const d=document.createElement("div");
    d.className="phrase";
    d.innerHTML=`
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>PRON:</b> ${p.pron}</p>
      <p><i>${categoryRu[p.category]}</i></p>
    `;
    c.appendChild(d);
  });
};
