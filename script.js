/* === КАТЕГОРИИ (ключи файлов, НЕ МЕНЯТЬ) === */
const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

/* === РУССКИЕ НАЗВАНИЯ (ТОЛЬКО ДЛЯ ОТОБРАЖЕНИЯ) === */
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
 village: "Село",
 guests: "Гости",
 communication: "Общение",
 work: "Работа",
 misc: "Разное"
};

let currentCategory = null;
let currentData = null;
let allPhrases = [];

/* === ЗАГРУЗКА === */
window.onload = async ()=>{
  loadCategories();
  await preloadAllCategories();
};

/* === СПИСОК КАТЕГОРИЙ === */
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = categoryNames[cat] || cat;
    d.onclick = ()=>loadCategory(cat);
    list.appendChild(d);
  });
}

/* === ЗАГРУЗКА КАТЕГОРИИ === */
async function loadCategory(cat){
  currentCategory = cat;
  document.getElementById("content-title").textContent =
    categoryNames[cat] || cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  renderPhrases();
}

/* === ОТОБРАЖЕНИЕ ФРАЗ === */
function renderPhrases(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((item,i)=>{
    const file = normalizePron(item.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <p><b>RU:</b> ${item.ru || ""}</p>
      <p><b>ING:</b> ${item.ing || ""}</p>
      <p><b>PRON:</b> ${item.pron || ""}</p>

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

/* === АУДИО === */
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

/* === УТИЛИТЫ === */
function normalizePron(p){
  return (p || "").toLowerCase()
    .trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

/* === ЗАГРУЗКА ВСЕХ ФРАЗ (ПОИСК) === */
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

/* === ГЛОБАЛЬНЫЙ ПОИСК === */
const sInput = document.getElementById("global-search");
const sBox = document.getElementById("search-results");

sInput.oninput = ()=>{
  const q = sInput.value.toLowerCase().trim();
  sBox.innerHTML = "";

  if(q.length < 2){
    sBox.classList.add("hidden");
    return;
  }

  allPhrases.filter(p =>
    (p.ru || "").toLowerCase().includes(q) ||
    (p.ing || "").toLowerCase().includes(q) ||
    (p.pron || "").toLowerCase().includes(q)
  ).slice(0,20).forEach(p=>{
    const d = document.createElement("div");
    d.className = "search-item";
    d.innerHTML = `
      <b>${p.ing || ""}</b>
      <small>${p.ru || ""} — ${categoryNames[p.category]}</small>
    `;
    d.onclick = ()=>{
      loadCategory(p.category);
      sInput.value="";
      sBox.classList.add("hidden");
    };
    sBox.appendChild(d);
  });

  sBox.classList.remove("hidden");
};

/* === КНОПКА ПОИСК === */
document.getElementById("search-btn").onclick = ()=>{
  const q = sInput.value.toLowerCase().trim();
  if(!q) return;

  const c = document.getElementById("content");
  document.getElementById("content-title").textContent =
    `Поиск: ${sInput.value}`;

  c.innerHTML = "";

  allPhrases.filter(p =>
    (p.ru || "").toLowerCase().includes(q) ||
    (p.ing || "").toLowerCase().includes(q) ||
    (p.pron || "").toLowerCase().includes(q)
  ).forEach(p=>{
    const d = document.createElement("div");
    d.className="phrase";
    d.innerHTML=`
      <p><b>ING:</b> ${p.ing || ""}</p>
      <p><b>RU:</b> ${p.ru || ""}</p>
      <p><b>PRON:</b> ${p.pron || ""}</p>
      <p><i>${categoryNames[p.category]}</i></p>
    `;
    c.appendChild(d);
  });
};
