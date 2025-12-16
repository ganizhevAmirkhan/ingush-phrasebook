/* ================== ГЛОБАЛЬНЫЕ ДАННЫЕ ================== */

const categories = [
  { id: "greetings", title: "Приветствия" },
  { id: "basic_phrases", title: "Основные фразы" },
  { id: "personal_info", title: "Личные данные" },
  { id: "family", title: "Семья" },
  { id: "home", title: "Дом" },
  { id: "food", title: "Еда" },
  { id: "drinks", title: "Питьё" },
  { id: "travel", title: "Путешествия" },
  { id: "transport", title: "Транспорт" },
  { id: "hunting", title: "Охота" },
  { id: "danger", title: "Опасность" },
  { id: "thermal", title: "Тепловизор" },
  { id: "orientation", title: "Ориентация" },
  { id: "weather", title: "Погода" },
  { id: "emotions", title: "Эмоции" },
  { id: "health", title: "Здоровье" },
  { id: "help", title: "Помощь" },
  { id: "commands", title: "Команды" },
  { id: "tools", title: "Инструменты" },
  { id: "animals", title: "Животные" },
  { id: "time", title: "Время" },
  { id: "numbers", title: "Числа" }
];

let currentCategory = null;
let currentData = null;
let adminMode = false;

/* ================== ИНИЦИАЛИЗАЦИЯ ================== */

window.onload = () => {
  renderCategories();
};

/* ================== КАТЕГОРИИ ================== */

function renderCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const div = document.createElement("div");
    div.className = "category";
    div.textContent = cat.title;
    div.onclick = () => loadCategory(cat.id, cat.title);
    list.appendChild(div);
  });
}

async function loadCategory(catId, title) {
  currentCategory = catId;
  document.getElementById("content-title").textContent = title;

  const res = await fetch(`categories/${catId}.json`);
  currentData = await res.json();

  renderPhrases(currentData.items);
}

/* ================== ОТОБРАЖЕНИЕ ФРАЗ ================== */

function renderPhrases(items) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${currentCategory}','${item.pron}')">🔊</button>
      <span class="audio-indicator" id="ai-${currentCategory}-${i}">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;

    content.appendChild(div);

    checkAudio(currentCategory, i, item.pron);
  });
}

/* ================== АУДИО ================== */

function normalizePron(p) {
  return p
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function playAudio(cat, pron) {
  const file = normalizePron(pron) + ".mp3";
  const url = `audio/${cat}/${file}?v=${Date.now()}`;

  new Audio(url)
    .play()
    .catch(() =>
      alert("Аудио ещё не доступно (GitHub Pages обновляется)")
    );
}

/* 🟢 проверка наличия аудио */
function checkAudio(cat, i, pron) {
  const file = normalizePron(pron) + ".mp3";
  const url = `audio/${cat}/${file}?v=${Date.now()}`;

  fetch(url, { method: "HEAD", cache: "no-store" })
    .then(r => {
      if (r.ok) {
        const el = document.getElementById(`ai-${cat}-${i}`);
        if (el) el.textContent = "🟢";
      }
    })
    .catch(() => {});
}

/* ================== ПОИСК ================== */

async function searchPhrases() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  if (!q) return;

  // если категория выбрана — ищем в ней
  if (currentCategory && currentData) {
    const filtered = currentData.items.filter(i =>
      i.ru.toLowerCase().includes(q) ||
      i.ing.toLowerCase().includes(q) ||
      i.pron.toLowerCase().includes(q)
    );
    renderPhrases(filtered);
    return;
  }

  // иначе — глобальный поиск
  const results = [];

  for (const cat of categories) {
    const res = await fetch(`categories/${cat.id}.json`);
    const data = await res.json();

    data.items.forEach(item => {
      if (
        item.ru.toLowerCase().includes(q) ||
        item.ing.toLowerCase().includes(q) ||
        item.pron.toLowerCase().includes(q)
      ) {
        results.push({ ...item, _cat: cat });
      }
    });
  }

  renderGlobalResults(results);
}

function renderGlobalResults(items) {
  const content = document.getElementById("content");
  content.innerHTML = "";
  document.getElementById("content-title").textContent = "Результаты поиска";

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <p><b>[${item._cat.title}]</b></p>
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${item._cat.id}','${item.pron}')">🔊</button>
    `;

    content.appendChild(div);
  });
}

/* ================== АДМИН ================== */

function adminLogin() {
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  if (currentData) renderPhrases(currentData.items);
}

function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON (латиница):");
  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  renderPhrases(currentData.items);
}

function editPhrase(i) {
  const it = currentData.items[i];
  it.ru = prompt("RU", it.ru);
  it.ing = prompt("ING", it.ing);
  it.pron = prompt("PRON", it.pron);
  renderPhrases(currentData.items);
}

function deletePhrase(i) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(i, 1);
  renderPhrases(currentData.items);
}
