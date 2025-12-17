const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

const categoryTitles = {
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

window.adminMode = false;
window.githubToken = localStorage.getItem("githubToken");

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();
  await preloadAllCategories();

  if (githubToken) {
    adminMode = true;
    document.getElementById("gh-token").value = githubToken;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }
};

/* ================= CATEGORIES ================= */

function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = categoryTitles[cat] || cat;
    d.onclick = () => loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory = cat;
  document.getElementById("content-title").textContent =
    categoryTitles[cat] || cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  renderPhrases();
}

/* ================= RENDER ================= */

function renderPhrases(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((item,i)=>{
    const file = normalizePron(item.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>PRON:</b> ${item.pron}</p>
      <i>${categoryTitles[currentCategory]}</i><br>

      <button onclick="playAudio('${currentCategory}','${file}')">▶</button>
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
        document.getElementById(`ai-${i}`).textContent="🟢";
      }
    });
}

function normalizePron(p){
  return (p||"").toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* ================= ADMIN ================= */

function adminLogin(){
  const token = document.getElementById("gh-token").value.trim();
  if(!token) return alert("Введите GitHub Token");

  githubToken = token;
  adminMode = true;
  localStorage.setItem("githubToken", token);

  document.getElementById("admin-status").textContent = "✓ Админ";
  if(currentData) renderPhrases();
}

/* ================= SEARCH (ИСПРАВЛЕНО) ================= */

async function preloadAllCategories(){
  allPhrases = [];
  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      d.items.forEach(it=>{
        allPhrases.push({...it, category: cat});
      });
    }catch{}
  }
}

const sInput = document.getElementById("global-search");
const sBox   = document.getElementById("search-results");

function hideSuggestions(){
  sBox.classList.add("hidden");
  sBox.innerHTML="";
}

sInput.oninput = ()=>{
  const q = sInput.value.toLowerCase().trim();
  sBox.innerHTML="";

  if(q.length < 2){
    hideSuggestions();
    return;
  }

  const found = allPhrases.filter(p =>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  ).slice(0,20);

  found.forEach(p=>{
    const d = document.createElement("div");
    d.className="search-item";
    d.textContent = `${p.ru} — ${categoryTitles[p.category]}`;
    d.onclick = ()=>{
      sInput.value = p.ru;
      hideSuggestions();
    };
    sBox.appendChild(d);
  });

  if(found.length){
    sBox.classList.remove("hidden");
  }else{
    hideSuggestions();
  }
};

document.getElementById("search-btn").onclick = ()=>{
  const q = sInput.value.toLowerCase().trim();
  if(!q) return;

  hideSuggestions();

  document.getElementById("content-title").textContent =
    `Поиск: ${sInput.value}`;

  const content = document.getElementById("content");
  content.innerHTML="";

  allPhrases.filter(p =>
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
      <i>${categoryTitles[p.category]}</i>
    `;
    content.appendChild(d);
  });
};

document.addEventListener("click",e=>{
  if(!e.target.closest(".search-wrap")){
    hideSuggestions();
  }
});

/* ================= DOWNLOAD ================= */

function downloadZip(){
  window.open(
    "https://github.com/ganizhevAmirkhan/ingush-phrasebook/archive/refs/heads/main.zip",
    "_blank"
  );
}
