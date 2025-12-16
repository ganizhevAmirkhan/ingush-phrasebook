/*************************************************
 * GLOBAL STATE
 *************************************************/
let adminMode = false;
let currentCategory = null;
let currentData = null;

/*************************************************
 * КАТЕГОРИИ (RU + ID)
 *************************************************/
const categories = [
  { id: "greetings", ru: "Приветствия" },
  { id: "basic_phrases", ru: "Основные фразы" },
  { id: "personal_info", ru: "Личные данные" },
  { id: "family", ru: "Семья" },
  { id: "home", ru: "Дом" },
  { id: "food", ru: "Еда" },
  { id: "drinks", ru: "Питьё" },
  { id: "travel", ru: "Путешествия" },
  { id: "transport", ru: "Транспорт" },
  { id: "hunting", ru: "Охота" },
  { id: "danger", ru: "Опасность" },
  { id: "thermal", ru: "Тепловизор" },
  { id: "orientation", ru: "Ориентация" },
  { id: "weather", ru: "Погода" },
  { id: "emotions", ru: "Эмоции" },
  { id: "health", ru: "Здоровье" },
  { id: "help", ru: "Помощь" },
  { id: "commands", ru: "Команды" },
  { id: "tools", ru: "Инструменты" },
  { id: "animals", ru: "Животные" },
  { id: "time", ru: "Время" },
  { id: "numbers", ru: "Числа" }
];

/*************************************************
 * INIT
 *************************************************/
window.addEventListener("DOMContentLoaded", () => {
  renderCategories();
});

/*************************************************
 * ADMIN
 *************************************************/
function adminLogin() {
  const tokenInput = document.getElementById("gh-token");
  const token = tokenInput.value.trim();

  if (!token) {
    alert("Введите GitHub Token");
    return;
  }

  localStorage.setItem("gh_token", token);
  adminMode = true;

  document.getElementById("admin-status").textContent = "✓ Админ";

  if (currentData) renderPhrases(currentData.items);
}

/*************************************************
 * CATEGORIES
 *************************************************/
function renderCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const div = document.createElement("div");
    div.className = "category";
    div.textContent = cat.ru;
    div.onclick = () => loadCategory(cat.id, cat.ru);
    list.appendChild(div);
  });
}

async function loadCategory(id, titleRu) {
  currentCategory = id;
  document.getElementById("content-title").textContent = titleRu;

  try {
    const res = await fetch(`categories/${id}.json`);
    currentData = await res.json();
    renderPhrases(currentData.items);
  } catch (e) {
    document.getElementById("content").innerHTML =
      "<b>Ошибка загрузки категории</b>";
  }
}

/*************************************************
 * RENDER PHRASES
 *************************************************/
function renderPhrases(items) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  items.forEach((p, i) => {
    const file = normalizePron(p.pron) + ".mp3";

    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <div><b>RU:</b> ${p.ru}</div>
      <div><b>ING:</b> ${p.ing}</div>
      <div><b>PRON:</b> ${p.pron}</div>

      <div style="margin-top:6px;">
        <button onclick="playAudio('${currentCategory}','${file}')">🔊</button>
        <span id="ai-${currentCategory}-${i}">⚪</span>

        ${adminMode ? `
          <button onclick="startRecording('${currentCategory}','${p.pron}')">🎤</button>
          <button onclick="editPhrase(${i})">✏</button>
          <button onclick="deletePhrase(${i})">🗑</button>
        ` : ""}
      </div>
    `;

    content.appendChild(div);
    checkAudio(currentCategory, i, file);
  });

  if (adminMode) {
    const btn = document.createElement("button");
    btn.textContent = "➕ Добавить фразу";
    btn.onclick = addPhrase;
    content.appendChild(btn);
  }
}

/*************************************************
 * AUDIO
 *************************************************/
function playAudio(cat, file) {
  const audio = new Audio(`audio/${cat}/${file}?v=${Date.now()}`);
  audio.play().catch(() => alert("Аудио не найдено"));
}

function checkAudio(cat, i, file) {
  const url = `audio/${cat}/${file}?v=${Date.now()}`;

  fetch(url, { method: "HEAD" })
    .then(r => {
      if (r.ok) {
        const el = document.getElementById(`ai-${cat}-${i}`);
        if (el) el.textContent = "🟢";
      }
    })
    .catch(() => {});
}

/*************************************************
 * SEARCH
 *************************************************/
async function searchPhrases() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const content = document.getElementById("content");

  if (!q) {
    content.innerHTML = "Введите текст для поиска";
    return;
  }

  content.innerHTML = "";
  document.getElementById("content-title").textContent = "Результаты поиска";

  // 🔹 Если категория выбрана — ищем в ней
  if (currentCategory && currentData) {
    const filtered = currentData.items.filter(p =>
      p.ru.toLowerCase().includes(q) ||
      p.ing.toLowerCase().includes(q) ||
      p.pron.toLowerCase().includes(q)
    );

    renderPhrases(filtered);
    return;
  }

  // 🔹 Иначе ищем ПО ВСЕМ КАТЕГОРИЯМ
  for (const cat of categories) {
    try {
      const res = await fetch(`categories/${cat.id}.json`);
      const data = await res.json();

      const hits = data.items.filter(p =>
        p.ru.toLowerCase().includes(q) ||
        p.ing.toLowerCase().includes(q) ||
        p.pron.toLowerCase().includes(q)
      );

      if (hits.length) {
        const h = document.createElement("h3");
        h.textContent = cat.ru;
        content.appendChild(h);

        hits.forEach((p, i) => {
          const file = normalizePron(p.pron) + ".mp3";
          const div = document.createElement("div");
          div.className = "phrase";
          div.innerHTML = `
            <div><b>RU:</b> ${p.ru}</div>
            <div><b>ING:</b> ${p.ing}</div>
            <div><b>PRON:</b> ${p.pron}</div>
            <button onclick="playAudio('${cat.id}','${file}')">🔊</button>
          `;
          content.appendChild(div);
        });
      }
    } catch {}
  }
}

/*************************************************
 * ADMIN CRUD
 *************************************************/
function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON (латиница):");
  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  saveCategory();
}

function editPhrase(i) {
  const p = currentData.items[i];
  p.ru = prompt("RU", p.ru) || p.ru;
  p.ing = prompt("ING", p.ing) || p.ing;
  p.pron = prompt("PRON", p.pron) || p.pron;
  saveCategory();
}

function deletePhrase(i) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(i, 1);
  saveCategory();
}

/*************************************************
 * SAVE TO GITHUB
 *************************************************/
async function saveCategory() {
  if (!adminMode) return;

  await githubPut(
    `categories/${currentCategory}.json`,
    JSON.stringify(currentData, null, 2),
    `Update ${currentCategory}`
  );

  renderPhrases(currentData.items);
}

/*************************************************
 * HELPERS
 *************************************************/
function normalizePron(p) {
  return p
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
