// ==================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==================================================
let categories = [
  "greetings", "basic_phrases", "personal_info", "family", "home",
  "food", "drinks", "travel", "transport", "hunting",
  "danger", "thermal", "orientation", "weather", "emotions",
  "health", "help", "commands", "tools", "animals",
  "time", "numbers", "colors", "money", "shop",
  "city", "village", "guests", "communication", "work", "misc"
];

let currentCategory = null;
let currentData = null;

// adminMode объявляется в admin.js
if (typeof adminMode === "undefined") {
  window.adminMode = false;
}

// ==================================================
// ЗАГРУЗКА КАТЕГОРИЙ
// ==================================================
window.onload = () => {
  loadCategories();
};

// ==================================================
// СПИСОК КАТЕГОРИЙ
// ==================================================
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const btn = document.createElement("div");
    btn.className = "category";
    btn.textContent = convertCategoryName(cat);
    btn.onclick = () => loadCategory(cat);
    list.appendChild(btn);
  });
}

// ==================================================
// РУССКИЕ НАЗВАНИЯ
// ==================================================
function convertCategoryName(cat) {
  const map = {
    greetings: "Приветствия",
    basic_phrases: "Основные фразы",
    personal_info: "Личные данные",
    family: "Семья",
    home: "Дом и быт",
    food: "Еда",
    drinks: "Питьё",
    travel: "Путешествия",
    transport: "Транспорт",
    hunting: "Охота",
    danger: "Опасность",
    thermal: "Тепловизор / наблюдение",
    orientation: "Ориентация на местности",
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
  return map[cat] || cat;
}

// ==================================================
// ЗАГРУЗКА КАТЕГОРИИ
// ==================================================
async function loadCategory(cat) {
  currentCategory = cat;

  const title = document.getElementById("content-title");
  const content = document.getElementById("content");

  title.textContent = "Загрузка...";
  content.innerHTML = "";

  try {
    const res = await fetch(`categories/${cat}.json`);
    if (!res.ok) throw new Error("Файл не найден");

    const data = await res.json();

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error("Неверный формат JSON");
    }

    // 🔁 fallback: локальные правки
    const local = localStorage.getItem(`cat_${cat}`);
    if (local) {
      currentData = JSON.parse(local);
    } else {
      currentData = data;
    }

    title.textContent = currentData.title || convertCategoryName(cat);
    renderPhrases(currentData);

  } catch (e) {
    title.textContent = "Ошибка";
    content.innerHTML = `<p style="color:red">${e.message}</p>`;
  }
}

// ==================================================
// ОТОБРАЖЕНИЕ ФРАЗ
// ==================================================
function renderPhrases(data) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  data.items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "phrase";

    const audioPath = `audio/${currentCategory}/${index}.webm`;

    div.innerHTML = `
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${audioPath}')">🔊</button>
      <span id="audio-status-${index}">⚪</span>

      ${adminMode ? `
        <button onclick="editPhrase(${index})">✏</button>
        <button onclick="deletePhrase(${index})">🗑</button>
        <button onclick="startRecording('${currentCategory}', ${index})">🎤</button>
      ` : ""}
    `;

    content.appendChild(div);
    checkAudio(audioPath, index);
  });

  if (adminMode) {
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Сохранить (локально)";
    saveBtn.onclick = saveLocal;
    saveBtn.style = "margin-top:15px;padding:8px";
    content.appendChild(saveBtn);
  }
}

// ==================================================
// АУДИО
// ==================================================
function playAudio(src) {
  const audio = new Audio(src);
  audio.play().catch(() => alert("Аудио не найдено"));
}

function checkAudio(path, index) {
  fetch(path, { method: "HEAD" })
    .then(r => {
      if (r.ok) {
        document.getElementById(`audio-status-${index}`).textContent = "🟢";
      }
    })
    .catch(() => {});
}

// ==================================================
// ЛОКАЛЬНОЕ СОХРАНЕНИЕ (fallback)
// ==================================================
function saveLocal() {
  if (!currentCategory || !currentData) return;
  localStorage.setItem(`cat_${currentCategory}`, JSON.stringify(currentData));
  alert("✔ Сохранено локально (Pages обновится позже)");
}

// ==================================================
// ПОИСК
// ==================================================
async function searchPhrases() {
  const q = document.getElementById("search-bar").value.toLowerCase();
  if (q.length < 2) return;

  const content = document.getElementById("content");
  document.getElementById("content-title").textContent = "Результаты поиска";
  content.innerHTML = "";

  for (let cat of categories) {
    try {
      const res = await fetch(`categories/${cat}.json`);
      if (!res.ok) continue;
      const data = await res.json();

      data.items.forEach((item, index) => {
        if (
          item.ru.toLowerCase().includes(q) ||
          item.ing.toLowerCase().includes(q)
        ) {
          const div = document.createElement("div");
          div.className = "phrase";
          div.innerHTML = `
            <h4>${convertCategoryName(cat)}</h4>
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>
            <button onclick="playAudio('audio/${cat}/${index}.webm')">🔊</button>
          `;
          content.appendChild(div);
        }
      });
    } catch {}
  }
}
