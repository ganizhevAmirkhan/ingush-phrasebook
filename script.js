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

// Глобальные флаги как у тебя
window.adminMode = false;
window.githubToken = localStorage.getItem("githubToken");

/* ================= INIT ================= */

if (githubToken) {
  adminMode = true;
  document.getElementById("gh-token").value = githubToken;
  document.getElementById("admin-status").textContent = "✓ Админ";

  const zipBtn = document.getElementById("download-zip");
  if (zipBtn) zipBtn.style.display = "block";
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

  const title = document.getElementById("content-title");
  if (title) title.textContent = categoryTitles[cat] || cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  renderPhrases();
}

/* ================= RENDER (КАТЕГОРИЯ) ================= */

function renderPhrases(){
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((item,i)=>{
    const file = normalizePron(item.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <p><b>ING:</b> ${item.ing || ""}</p>
      <p><b>RU:</b> ${item.ru || ""}</p>
      <p><b>PRON:</b> ${item.pron || ""}</p>
      <i>${categoryTitles[currentCategory] || currentCategory}</i><br>

      <button onclick="playAudio('${currentCategory}','${file}')">▶</button>
      <span id="ai-${i}">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}','${item.pron || ""}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;
    content.appendChild(div);
    checkAudio(i, file);
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

// Старый индикатор (для режима категории)
function checkAudio(i,file){
  fetch(`audio/${currentCategory}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        const el = document.getElementById(`ai-${i}`);
        if (el) el.textContent="🟢";
      }
    });
}

// Новый индикатор (для результатов поиска, где категория разная)
function checkAudioForSpan(cat, spanId, file){
  fetch(`audio/${cat}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok){
        const el = document.getElementById(spanId);
        if (el) el.textContent = "🟢";
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

  const zipBtn = document.getElementById("download-zip");
  if (zipBtn) zipBtn.style.display = "block";

  if(currentData) renderPhrases();
}


/* ================= SEARCH (ПРАВИЛЬНО) ================= */

async function preloadAllCategories(){
  allPhrases = [];
  for(const cat of categories){
    try{
      const r = await fetch(`categories/${cat}.json`);
      const d = await r.json();
      (d.items || []).forEach(it=>{
        allPhrases.push({
          ru: it.ru || "",
          ing: it.ing || "",
          pron: it.pron || "",
          category: cat
        });
      });
    }catch{}
  }
}

// Элементы поиска
const sInput = document.getElementById("global-search");
const sBox   = document.getElementById("search-results");
const sBtn   = document.getElementById("search-btn");

function hideSuggestions(){
  if (!sBox) return;
  sBox.classList.add("hidden");
  sBox.innerHTML = "";
}

function showSuggestions(){
  if (!sBox) return;
  sBox.classList.remove("hidden");
}

// Внутренняя утилита: "что показать в подсказке"
function suggestionText(p){
  // если ru есть — показываем ru, иначе ing, иначе pron
  const main = (p.ru || p.ing || p.pron || "").trim();
  const catName = categoryTitles[p.category] || p.category;
  return `${main} — ${catName}`;
}

// Внутренняя утилита: вставить подсказку в строку
function applySuggestionToInput(p){
  // В строку вставляем саму фразу (лучше RU, если есть)
  const text = (p.ru || p.ing || p.pron || "").trim();
  sInput.value = text;
  hideSuggestions();
  sInput.focus();
}

// Генерация подсказок при вводе
if (sInput){
  sInput.oninput = ()=>{
    const q = sInput.value.toLowerCase().trim();
    if (!sBox) return;

    sBox.innerHTML = "";

    if(q.length < 2){
      hideSuggestions();
      return;
    }

    const found = allPhrases
      .filter(p =>
        (p.ru||"").toLowerCase().includes(q) ||
        (p.ing||"").toLowerCase().includes(q) ||
        (p.pron||"").toLowerCase().includes(q)
      )
      .slice(0, 30);

    if (found.length === 0){
      hideSuggestions();
      return;
    }

    found.forEach(p=>{
      const d = document.createElement("div");
      d.className = "search-item";
      d.textContent = suggestionText(p);

      // ВАЖНО: клик по подсказке НЕ грузит категорию,
      // а просто вставляет текст и закрывает подсказки.
      d.onclick = ()=> applySuggestionToInput(p);

      sBox.appendChild(d);
    });

    showSuggestions();
  };

  // Enter = поиск
  sInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      doSearch();
    } else if (e.key === "Escape"){
      hideSuggestions();
    }
  });
}

// Поиск по кнопке
if (sBtn){
  sBtn.onclick = ()=> doSearch();
}

// Рендер одной карточки результата (чтобы были ▶ и индикатор)
function renderSearchResultCard(p, idx){
  const file = normalizePron(p.pron) + ".mp3";
  const spanId = `sai-${idx}-${Math.random().toString(16).slice(2)}`;

  const div = document.createElement("div");
  div.className = "phrase";

  // В поиске делаем безопасно: редактирование не показываем,
  // потому что editPhrase/deletePhrase работают по индексу currentData текущей категории.
  // Чтобы редактировать — даём кнопку открыть категорию.
  div.innerHTML = `
    <p><b>ING:</b> ${p.ing || ""}</p>
    <p><b>RU:</b> ${p.ru || ""}</p>
    <p><b>PRON:</b> ${p.pron || ""}</p>
    <i>${categoryTitles[p.category] || p.category}</i><br>

    <button onclick="playAudio('${p.category}','${file}')">▶</button>
    <span id="${spanId}">⚪</span>

    ${adminMode ? `
      <button onclick="openCategoryFromSearch('${p.category}','${encodeURIComponent(p.pron || "")}')">✏ Открыть категорию</button>
    ` : ""}
  `;

  // Проверяем аудио
  checkAudioForSpan(p.category, spanId, file);

  return div;
}

// Открыть категорию из результатов поиска (для редактирования в правильной логике)
window.openCategoryFromSearch = async (cat, pronEnc)=>{
  const pron = decodeURIComponent(pronEnc || "");
  await loadCategory(cat);

  // попробуем подсветить фразу по pron
  setTimeout(()=>{
    const content = document.getElementById("content");
    if(!content) return;

    const cards = content.querySelectorAll(".phrase");
    for(const card of cards){
      const text = card.innerText || "";
      if(pron && text.includes(pron)){
        card.scrollIntoView({behavior:"smooth", block:"center"});
        card.style.outline = "3px solid #1f6feb";
        setTimeout(()=> card.style.outline = "", 1200);
        break;
      }
    }
  }, 100);
};

function doSearch(){
  if (!sInput) return;
  const q = sInput.value.toLowerCase().trim();
  if(!q) return;

  // ВАЖНО: подсказки должны исчезать и не мешать
  hideSuggestions();

  const title = document.getElementById("content-title");
  if (title) title.textContent = `Поиск: ${sInput.value}`;

  const content = document.getElementById("content");
  content.innerHTML = "";

  const results = allPhrases.filter(p =>
    (p.ru||"").toLowerCase().includes(q) ||
    (p.ing||"").toLowerCase().includes(q) ||
    (p.pron||"").toLowerCase().includes(q)
  );

  if(results.length === 0){
    content.innerHTML = `<p>Ничего не найдено.</p>`;
    return;
  }

  results.forEach((p, idx)=>{
    content.appendChild(renderSearchResultCard(p, idx));
  });
}

// Закрывать подсказки кликом вне поиска
document.addEventListener("click", e=>{
  if(!e.target.closest(".search-wrap")){
    hideSuggestions();
  }
});

/* ================= ZIP ================= */

function downloadZip(){
  window.open(
    "https://github.com/ganizhevAmirkhan/ingush-phrasebook/archive/refs/heads/main.zip",
    "_blank"
  );
}



