const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

// русские названия категорий
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
 work:"Работа",
 misc:"Разное"
};

let currentCategory = null;
let currentData = null;
let allPhrases = [];
let backupItems = null; // для возврата после поиска

/* ================= INIT ================= */

window.onload = async ()=>{
  loadCategories();
  restoreToken();
  await preloadAllCategories();
};

/* ================= TOKEN ================= */

function restoreToken(){
  const t = localStorage.getItem("gh-token");
  if(t){
    document.getElementById("gh-token").value = t;
  }
}

function saveToken(){
  const t = document.getElementById("gh-token").value.trim();
  if(t) localStorage.setItem("gh-token", t);
}

/* ================= CATEGORIES ================= */

function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className="category";
    d.textContent = categoryTitles[cat] || cat;
    d.onclick = ()=> loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory = cat;
  document.getElementById("content-title").textContent =
    categoryTitles[cat] || cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  backupItems = null;
  renderPhrases();
}

/* ================= RENDER ================= */

function renderPhrases(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((item,i)=>{
    const file = normalizePron(item.pron)+".mp3";
    const div = document.createElement("div");
    div.className="phrase";
    div.innerHTML = `
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>PRON:</b> ${item.pron}</p>
      <i>${categoryTitles[currentCategory]}</i><br>

      <button onclick="playAudio('${currentCategory}','${file}')">🔊</button>
      <span id="ai-${i}">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;
    content.appendChild(div);
    checkAudio(i,file);
  });

  if(adminMode){
    const b = document.createElement("button");
    b.textContent = "➕ Добавить фразу";
    b.onclick = addPhrase;
    content.appendChild(b);
  }
}

/* ================= AUDIO ================= */

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио ещё не доступно"));
}

function checkAudio(i,file){
  fetch(`audio/${currentCategory}/${file}`,{method:"HEAD"})
   .then(r=>{
     if(r.ok){
       const el = document.getElementById(`ai-${i}`);
       if(el) el.textContent="🟢";
     }
   });
}

function normalizePron(p){
  return (p||"").toLowerCase()
    .trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* ================= SEARCH ================= */

async function preloadAllCategories(){
  allPhrases = [];
  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      d.items.forEach(it=>{
        allPhrases.push({...it, category:cat});
      });
    }catch{}
  }
}

const sInput = document.getElementById("global-search");
const sBox = document.getElementById("search-results");

sInput.oninput = ()=>{
  const q = sInput.value.toLowerCase().trim();
  sBox.innerHTML="";
  if(q.length < 2){
    sBox.classList.add("hidden");
    return;
  }

  allPhrases.filter(p=>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).slice(0,15).forEach(p=>{
    const d = document.createElement("div");
    d.className="search-item";
    d.textContent = `${p.ru} — ${categoryTitles[p.category]}`;
    sBox.appendChild(d);
  });

  sBox.classList.remove("hidden");
};

document.getElementById("search-btn").onclick = ()=>{
  const q = sInput.value.toLowerCase().trim();
  if(!q) return;

  sBox.classList.add("hidden");

  if(!backupItems){
    backupItems = currentData ? currentData.items : [];
  }

  currentCategory = "search";
  document.getElementById("content-title").textContent =
    `Поиск: ${sInput.value}`;

  currentData = {
    items: allPhrases.filter(p=>
      (p.ru||"").toLowerCase().includes(q) ||
      (p.ing||"").toLowerCase().includes(q) ||
      (p.pron||"").toLowerCase().includes(q)
    )
  };

  renderPhrases();
};

/* ================= ADMIN ================= */

function adminLogin(){
  saveToken();
  const token = document.getElementById("gh-token").value.trim();
  if(!token) return alert("Введите GitHub Token");
  adminMode = true;
  githubToken = token;
  document.getElementById("admin-status").textContent="✓ Админ";
  if(currentData) renderPhrases();
}
