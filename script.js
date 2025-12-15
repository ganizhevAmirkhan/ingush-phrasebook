// ======================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (через window, чтобы admin.js видел их)
// ======================================
window.categories = [
  "greetings","basic_phrases","personal_info","family","home",
  "food","drinks","travel","transport","hunting",
  "danger","thermal","orientation","weather","emotions",
  "health","help","commands","tools","animals",
  "time","numbers","colors","money","shop",
  "city","village","guests","communication","conversation","work",
  "misc"
];

window.currentCategory = null;
window.currentData = null;

// админ-режим по умолчанию выключен (admin.js может включить)
if (typeof window.adminMode === "undefined") window.adminMode = false;

// ======================================
// Названия категорий
// ======================================
function convertCategoryName(cat) {
  const map = {
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
    conversation:"Разговор",
    work:"Работа",
    misc:"Разное"
  };
  return map[cat] || cat;
}

// ======================================
// Загрузка списка категорий
// ======================================
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  window.categories.forEach(cat => {
    const div = document.createElement("div");
    div.className = "category";
    div.textContent = convertCategoryName(cat);
    div.onclick = () => loadCategory(cat);
    list.appendChild(div);
  });
}

// ======================================
// Загрузка категории
// ======================================
async function loadCategory(category) {
  window.currentCategory = category;

  const title = document.getElementById("content-title");
  const content = document.getElementById("content");

  title.textContent = convertCategoryName(category);
  content.innerHTML = "<p class='note'>Загрузка...</p>";

  try {
    const res = await fetch(`categories/${category}.json`);
    if (!res.ok) throw new Error("Файл не найден");

    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error("JSON неверного формата (нет items[])");

    window.currentData = data;
    renderPhrases(data);
  } catch (e) {
    content.innerHTML = `<p class="error">Ошибка загрузки: ${e.message}</p>`;
  }
}

// ======================================
// Отображение фраз
// ======================================
function renderPhrases(data) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  if (!data.items.length) {
    content.innerHTML = "<p class='note'>Фразы отсутствуют.</p>";
  }

  data.items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "phrase";

    const ru = item.ru ?? "";
    const ing = item.ing ?? "";
    const pron = item.pron ?? "";

    div.innerHTML = `
      <div class="row">
        <div><b>RU:</b> ${escapeHtml(ru)}</div>
      </div>
      <div class="row">
        <div><b>ING:</b> ${escapeHtml(ing)}</div>
      </div>
      <div class="row">
        <div><b>PRON:</b> ${escapeHtml(pron)}</div>
      </div>

      <div style="margin-top:10px;">
        <button class="btn-small btn-ghost" onclick="playAudio('${window.currentCategory}', ${index})">🔊</button>
        ${window.adminMode ? `
          <button class="btn-small btn-primary" onclick="editPhrase(${index})">✏</button>
          <button class="btn-small btn-danger" onclick="deletePhrase(${index})">🗑</button>
          <button class="btn-small btn-ghost" onclick="startRecording(${index})">🎤</button>
        ` : ""}
      </div>
    `;

    content.appendChild(div);
  });

  if (window.adminMode) {
    const bar = document.createElement("div");
    bar.style.marginTop = "14px";
    bar.innerHTML = `
      <button class="btn btn-primary" onclick="addPhrase()">➕ Добавить фразу</button>
      <button class="btn btn-ghost" onclick="saveCategory()">💾 Скачать JSON категории</button>
    `;
    content.appendChild(bar);
  }
}

// ======================================
// Поиск
// ======================================
async function searchPhrases() {
  const q = document.getElementById("search-bar").value.trim().toLowerCase();
  if (q.length < 2) return;

  const title = document.getElementById("content-title");
  const content = document.getElementById("content");
  title.textContent = "Результаты поиска";
  content.innerHTML = "<p class='note'>Поиск...</p>";

  let results = [];

  for (const cat of window.categories) {
    try {
      const res = await fetch(`categories/${cat}.json`);
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data.items)) continue;

      data.items.forEach((item, index) => {
        const ru = (item.ru ?? "").toLowerCase();
        const ing = (item.ing ?? "").toLowerCase();
        if (ru.includes(q) || ing.includes(q)) results.push({ ...item, cat, index });
      });
    } catch {}
  }

  content.innerHTML = "";
  if (!results.length) {
    content.innerHTML = "<p class='note'>Ничего не найдено.</p>";
    return;
  }

  results.forEach(r => {
    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <h3 style="margin:0 0 8px 0;">${convertCategoryName(r.cat)}</h3>
      <div><b>RU:</b> ${escapeHtml(r.ru ?? "")}</div>
      <div><b>ING:</b> ${escapeHtml(r.ing ?? "")}</div>
      <div><b>PRON:</b> ${escapeHtml(r.pron ?? "")}</div>
      <div style="margin-top:10px;">
        <button class="btn-small btn-ghost" onclick="playAudio('${r.cat}', ${r.index})">🔊</button>
      </div>
    `;
    content.appendChild(div);
  });
}

// ======================================
// Аудио
// ======================================
function playAudio(category, index) {
  const audio = new Audio(`audio/${category}/${index}.mp3`);
  audio.play().catch(() => alert("Аудиофайл не найден"));
}

// ======================================
// Утилита: защита вывода
// ======================================
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ======================================
// Старт
// ======================================
window.addEventListener("load", loadCategories);
