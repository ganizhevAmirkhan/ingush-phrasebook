// ================== НАСТРОЙКИ ==================
const categories = [
  "greetings","basic_phrases","personal_info","family","home",
  "food","drinks","travel","transport","hunting","danger",
  "thermal","orientation","weather","emotions","health","help",
  "commands","tools","animals","time","numbers","colors","money",
  "shop","city","village","guests","communication","work","misc"
];

const categoryNames = {
  greetings:"Приветствия",
  basic_phrases:"Основные фразы",
  personal_info:"Личные данные",
  family:"Семья",
  home:"Дом и быт",
  food:"Еда",
  drinks:"Питьё",
  travel:"Путешествия",
  transport:"Транспорт",
  hunting:"Охота",
  danger:"Опасность",
  thermal:"Тепловизор / наблюдение",
  orientation:"Ориентация на местности",
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
  village:"Село",
  guests:"Гости",
  communication:"Общение",
  work:"Работа",
  misc:"Разное"
};

// ================== СОСТОЯНИЕ ==================
let adminMode = false;
let currentCategory = null;
let currentData = null;

// ================== ЗАПУСК ==================
window.onload = loadCategories;

// ================== КАТЕГОРИИ ==================
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = categoryNames[cat] || cat;
    d.onclick = () => loadCategory(cat);
    list.appendChild(d);
  });
}

// ================== ЗАГРУЗКА КАТЕГОРИИ ==================
async function loadCategory(cat) {
  currentCategory = cat;
  document.getElementById("content-title").textContent =
    categoryNames[cat];

  const content = document.getElementById("content");
  content.innerHTML = "Загрузка...";

  try {
    const res = await fetch(`categories/${cat}.json`);
    currentData = await res.json();
    renderPhrases();
  } catch {
    content.innerHTML = "<span style='color:red'>Ошибка загрузки</span>";
  }
}

// ================== ФРАЗЫ ==================
function renderPhrases() {
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "phrase";

    const file = normalizePron(p.pron) + ".webm";

    d.innerHTML = `
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>PRON:</b> ${p.pron}</p>

      <button onclick="playAudio('${file}')">🔊</button>

      ${adminMode ? `
        <button onclick="startRecording('${p.pron}','${currentCategory}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;
    content.appendChild(d);
  });

  if (adminMode) {
    const b = document.createElement("button");
    b.textContent = "➕ Добавить фразу";
    b.onclick = addPhrase;
    content.appendChild(b);
  }
}

// ================== АУДИО ==================
function playAudio(file) {
  const audio = new Audio(`audio/${currentCategory}/${file}?v=${Date.now()}`);
  audio.play().catch(()=>alert("Аудио ещё не доступно"));
}

// ================== АДМИН ==================
function adminLogin() {
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  if (currentData) renderPhrases();
}

// ================== CRUD ==================
function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON (латиница):");
  if (!ru || !ing || !pron) return;
  currentData.items.push({ ru, ing, pron });
  saveCategoryToGitHub();
}

function editPhrase(i) {
  const p = currentData.items[i];
  p.ru = prompt("RU:", p.ru);
  p.ing = prompt("ING:", p.ing);
  p.pron = prompt("PRON:", p.pron);
  saveCategoryToGitHub();
}

function deletePhrase(i) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(i, 1);
  saveCategoryToGitHub();
}

// ================== УТИЛИТЫ ==================
function normalizePron(p) {
  return p.toLowerCase().trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
