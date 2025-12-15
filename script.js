// =======================
// НАСТРОЙКИ
// =======================
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

// =======================
let adminMode = false;
let currentCategory = null;
let currentData = null;

// =======================
// ЗАГРУЗКА КАТЕГОРИЙ
// =======================
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

// =======================
// ЗАГРУЗКА КАТЕГОРИИ
// =======================
async function loadCategory(cat) {
  currentCategory = cat;
  document.getElementById("content-title").textContent =
    categoryNames[cat];

  const content = document.getElementById("content");
  content.innerHTML = "Загрузка...";

  try {
    const res = await fetch(`categories/${cat}.json`);
    const data = await res.json();
    currentData = data;
    renderPhrases();
  } catch {
    content.innerHTML = "<span style='color:red'>Ошибка загрузки</span>";
  }
}

// =======================
// ОТОБРАЖЕНИЕ ФРАЗ
// =======================
function renderPhrases() {
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "phrase";

    d.innerHTML = `
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>PRON:</b> ${p.pron}</p>
      <button onclick="playAudio(${i})">🔊</button>
      ${adminMode ? `
        <button class="admin-btn" onclick="editPhrase(${i})">✏</button>
        <button class="admin-btn" onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;
    content.appendChild(d);
  });

  if (adminMode) {
    const add = document.createElement("button");
    add.textContent = "➕ Добавить фразу";
    add.onclick = addPhrase;
    add.style.marginTop = "10px";
    content.appendChild(add);
  }
}

// =======================
// АУДИО (ТОЛЬКО ПРОИГРЫВАНИЕ)
// =======================
function playAudio(i) {
  const audio = new Audio(`audio/${currentCategory}/${i}.webm`);
  audio.play().catch(()=>alert("Аудио отсутствует"));
}

// =======================
// ПОИСК
// =======================
async function searchPhrases() {
  const q = document.getElementById("search-input").value.toLowerCase();
  if (q.length < 2) return;

  const content = document.getElementById("content");
  document.getElementById("content-title").textContent = "Результаты поиска";
  content.innerHTML = "";

  for (const cat of categories) {
    try {
      const res = await fetch(`categories/${cat}.json`);
      const data = await res.json();
      data.items.forEach(p => {
        if (p.ru.toLowerCase().includes(q) ||
            p.ing.toLowerCase().includes(q)) {
          const d = document.createElement("div");
          d.className = "phrase";
          d.innerHTML = `
            <b>${categoryNames[cat]}</b>
            <p>${p.ru}</p>
            <p>${p.ing}</p>
          `;
          content.appendChild(d);
        }
      });
    } catch {}
  }
}

// =======================
// АДМИН
// =======================
function adminLogin() {
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  if (currentData) renderPhrases();
}

// =======================
// CRUD ФРАЗ
// =======================
function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON:");
  if (!ru || !ing || !pron) return;
  currentData.items.push({ru,ing,pron});
  renderPhrases();
}

function editPhrase(i) {
  const p = currentData.items[i];
  p.ru = prompt("RU:",p.ru);
  p.ing = prompt("ING:",p.ing);
  p.pron = prompt("PRON:",p.pron);
  renderPhrases();
}

function deletePhrase(i) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(i,1);
  renderPhrases();
}

// =======================
window.onload = loadCategories;
