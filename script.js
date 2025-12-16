/*************************************************
 * GLOBAL STATE
 *************************************************/
let adminMode = false;
let currentCategory = null;
let currentData = null;

/*************************************************
 * FULL CATEGORY LIST (как у тебя слева на русском)
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
  { id: "orientation", ru: "Ориентация на местности" },
  { id: "weather", ru: "Погода" },
  { id: "emotions", ru: "Эмоции" },
  { id: "health", ru: "Здоровье" },
  { id: "help", ru: "Помощь" },
  { id: "commands", ru: "Команды" },
  { id: "tools", ru: "Инструменты" },
  { id: "animals", ru: "Животные" },
  { id: "time", ru: "Время" },
  { id: "numbers", ru: "Числа" },
  { id: "colors", ru: "Цвета" },
  { id: "money", ru: "Деньги" },
  { id: "shop", ru: "Магазин" },
  { id: "city", ru: "Город" },
  { id: "village", ru: "Село" },
  { id: "guests", ru: "Гости" },
  { id: "communication", ru: "Связь" },
  { id: "work", ru: "Работа" },
  { id: "misc", ru: "Разное" }
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
  const token = document.getElementById("gh-token").value.trim();
  if (!token) return alert("Введите GitHub Token");

  localStorage.setItem("gh_token", token);
  adminMode = true;

  document.getElementById("admin-status").textContent = "✓ Админ";

  // перерисовать текущую категорию (чтобы появились кнопки)
  if (currentData) renderPhrases(currentData.items, currentCategory);
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
    if (!res.ok) throw new Error("Категория не найдена");
    currentData = await res.json();
    renderPhrases(currentData.items, id);
  } catch (e) {
    document.getElementById("content").innerHTML = "<b>Ошибка загрузки категории</b>";
  }
}

/*************************************************
 * RENDER
 *************************************************/
function renderPhrases(items, catId) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  items.forEach((p, i) => {
    const file = normalizePron(p.pron) + ".mp3";
    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <div><b>RU:</b> ${escapeHtml(p.ru)}</div>
      <div><b>ING:</b> ${escapeHtml(p.ing)}</div>
      <div><b>PRON:</b> ${escapeHtml(p.pron)}</div>

      <div class="btn-row">
        <button onclick="playAudio('${catId}','${file}')">🔊</button>
        <span id="ai-${catId}-${i}">⚪</span>

        ${adminMode ? `
          <button onclick="startRecording('${catId}','${p.pron}')">🎤</button>
          <button onclick="editPhrase(${i})">✏</button>
          <button onclick="deletePhrase(${i})">🗑</button>
        ` : ""}
      </div>
    `;

    content.appendChild(div);
    checkAudio(catId, i, file);
  });

  if (adminMode && currentCategory) {
    const addBtn = document.createElement("button");
    addBtn.textContent = "➕ Добавить фразу";
    addBtn.onclick = addPhrase;
    content.appendChild(addBtn);
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
 * SEARCH (категория выбрана -> внутри, иначе -> по всем)
 *************************************************/
async function searchPhrases() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const content = document.getElementById("content");

  if (!q) {
    content.innerHTML = "<div class='hint'>Введите текст для поиска.</div>";
    return;
  }

  document.getElementById("content-title").textContent = "Результаты поиска";
  content.innerHTML = "<div class='hint'>Поиск...</div>";

  // 1) если категория выбрана — ищем в ней
  if (currentCategory && currentData) {
    const filtered = currentData.items.filter(p =>
      (p.ru || "").toLowerCase().includes(q) ||
      (p.ing || "").toLowerCase().includes(q) ||
      (p.pron || "").toLowerCase().includes(q)
    );

    renderPhrases(filtered, currentCategory);
    if (!filtered.length) {
      content.innerHTML = "<div class='hint'>Ничего не найдено в выбранной категории.</div>";
    }
    return;
  }

  // 2) если категория НЕ выбрана — ищем по всем категориям
  content.innerHTML = "";
  let total = 0;

  for (const cat of categories) {
    try {
      const res = await fetch(`categories/${cat.id}.json`);
      if (!res.ok) continue;

      const data = await res.json();
      const hits = (data.items || []).filter(p =>
        (p.ru || "").toLowerCase().includes(q) ||
        (p.ing || "").toLowerCase().includes(q) ||
        (p.pron || "").toLowerCase().includes(q)
      );

      if (hits.length) {
        total += hits.length;

        const h = document.createElement("h3");
        h.textContent = cat.ru;
        content.appendChild(h);

        hits.forEach(p => {
          const file = normalizePron(p.pron) + ".mp3";
          const div = document.createElement("div");
          div.className = "phrase";
          div.innerHTML = `
            <div><b>RU:</b> ${escapeHtml(p.ru)}</div>
            <div><b>ING:</b> ${escapeHtml(p.ing)}</div>
            <div><b>PRON:</b> ${escapeHtml(p.pron)}</div>
            <div class="btn-row">
              <button onclick="playAudio('${cat.id}','${file}')">🔊</button>
            </div>
          `;
          content.appendChild(div);
        });
      }
    } catch {}
  }

  if (!total) {
    content.innerHTML = "<div class='hint'>Ничего не найдено по всем категориям.</div>";
  }
}

/*************************************************
 * ADMIN CRUD (редакт / удалить / добавить)
 *************************************************/
function addPhrase() {
  if (!adminMode) return;

  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON (латиница):");
  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  saveCategory();
}

function editPhrase(i) {
  if (!adminMode) return;

  const p = currentData.items[i];
  const ru = prompt("RU", p.ru);
  const ing = prompt("ING", p.ing);
  const pron = prompt("PRON", p.pron);

  if (ru !== null) p.ru = ru;
  if (ing !== null) p.ing = ing;
  if (pron !== null) p.pron = pron;

  saveCategory();
}

function deletePhrase(i) {
  if (!adminMode) return;
  if (!confirm("Удалить фразу?")) return;

  currentData.items.splice(i, 1);
  saveCategory();
}

/*************************************************
 * SAVE TO GITHUB (используем githubPut из github.js)
 *************************************************/
async function saveCategory() {
  if (!adminMode) return;
  if (!currentCategory) return;

  try {
    await githubPut(
      `categories/${currentCategory}.json`,
      JSON.stringify(currentData, null, 2),
      `Update ${currentCategory}`
    );
    renderPhrases(currentData.items, currentCategory);
  } catch (e) {
    alert("Ошибка сохранения в GitHub. Проверь токен.");
  }
}

/*************************************************
 * HELPERS
 *************************************************/
function normalizePron(p) {
  return (p || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
