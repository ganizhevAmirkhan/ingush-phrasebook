/* ================= CONFIG ================= */

const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-phrasebook";
const BRANCH = "main";

/* ================= STATE ================= */

let currentCategory = null;
let currentData = null;
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

/* ================= UTILS ================= */

function genId(){
  return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
}
const safe = v => (v ?? "").toString();

/* ================= INIT ================= */

window.onload = async () => {
  loadCategories();

  if(githubToken){
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }
};

/* ================= CATEGORIES ================= */

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
  currentCategory = cat;
  document.getElementById("content-title").textContent = categoryTitles[cat];

  const r = await fetch(`categories/${cat}.json`);
  currentData = await r.json();

  migrateItems(currentData);
  renderCategory();
}

/* ================= MIGRATION ================= */

function migrateItems(data){
  let changed = false;

  data.items.forEach(it=>{
    if(!it.id){
      it.id = genId();
      changed = true;
    }

    // ВСЕГДА webm
    if(!it.audio || it.audio.endsWith(".mp3")){
      it.audio = it.id + ".webm";
      changed = true;
    }
  });

  return changed;
}

/* ================= RENDER ================= */

function renderPhrase(item){
  return `
  <div class="phrase">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>

    <button onclick="playAudio('${item.category}','${item.audio}')">▶</button>
    <span id="ai-${item.audio}">⚪</span>

    ${adminMode ? `<button onclick="recordById('${item.id}')">🎤</button>` : ""}
  </div>`;
}

function renderCategory(){
  const c = document.getElementById("content");
  c.innerHTML = "";

  currentData.items.forEach(it=>{
    it.category = currentCategory;
    c.insertAdjacentHTML("beforeend", renderPhrase(it));
    checkAudio(it.category, it.audio);
  });
}

/* ================= AUDIO ================= */

function playAudio(cat, file){
  const url = `audio/${cat}/${file}?v=${Date.now()}`;
  const audio = new Audio(url);

  audio.onplay = () => setIndicator(file,"🟢");
  audio.onended = () => setIndicator(file,"⚪");
  audio.onerror = () => {
    setIndicator(file,"🔴");
    alert("Аудио не найдено");
  };

  audio.play().catch(()=>{
    setIndicator(file,"🔴");
    alert("Ошибка воспроизведения");
  });
}

function checkAudio(cat,file){
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok) setIndicator(file,"🟢");
    });
}

function setIndicator(file,icon){
  const el = document.getElementById(`ai-${file}`);
  if(el) el.textContent = icon;
}

/* ================= ADMIN ================= */

function recordById(id){
  startRecording(currentCategory,id);
}
