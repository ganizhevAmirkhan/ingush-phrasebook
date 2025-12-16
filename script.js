// ================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ================================
let adminMode = false;
let currentCategory = null; // id категории (латиница)
let currentData = null;

// ================================
// СПИСОК КАТЕГОРИЙ
// ================================
const categories = [
  { id: "greetings", title: "Приветствия" },
  { id: "basic_phrases", title: "Основные фразы" },
  { id: "personal_info", title: "Личные данные" },
  { id: "family", title: "Семья" },
  { id: "home", title: "Дом и быт" },
  { id: "food", title: "Еда" },
  { id: "drinks", title: "Питьё" },
  { id: "travel", title: "Путешествия" },
  { id: "transport", title: "Транспорт" },
  { id: "hunting", title: "Охота" },
  { id: "danger", title: "Опасность" },
  { id: "thermal", title: "Тепловизор / наблюдение" },
  { id: "orientation", title: "Ориентация на местности" },
  { id: "weather", title: "Погода" },
  { id: "emotions", title: "Эмоции" },
  { id: "health", title: "Здоровье" },
  { id: "help", title: "Помощь" },
  { id: "commands", title: "Команды" },
  { id: "tools", title: "Инструменты" }
];

// ================================
// ЗАГРУЗКА КАТЕГОРИЙ
// ================================
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const div = document.createElement("div");
    div.className = "category";
    div.textContent = cat.title;
    div.onclick = () => loadCategory(cat);
    list.appendChild(div);
  });
}

// ================================
// ЗАГРУЗКА ОДНОЙ КАТЕГОРИИ
// ================================
async function loadCategory(cat) {
  currentCategory = cat.id;
  document.getElementById("content-title").innerText = cat.title;

  const content = document.getElementById("content");
  content.innerHTML = "Загрузка...";

  try {
    const res = await fetch(`categories/${cat.id}.json`);
    if (!res.ok) throw new Error("JSON не найден");

    const data = await res.json();
    if (!Array.isArray(data.items)) {
      throw new Error("Неверный формат JSON (нет items[])");
    }

    currentData = data;
    renderPhrases();

  } catch (e) {
    content.innerHTML = `<p style="color:red">Ошибка загрузки</p>`;
    console.error(e);
  }
}

// ================================
// ОТРИСОВКА ФРАЗ
// ================================
function renderPhrases() {
  const content = document.getElementById("content");
  content.innerHTML = "";

  currentData.items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <p><b>RU:</b> ${item.ru || ""}</p>
      <p><b>ING:</b> ${item.ing || ""}</p>
      <p><b>PRON:</b> ${item.pron || ""}</p>

      <button onclick="playAudio('${currentCategory}', '${item.pron || index}')">🔊</button>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}', '${item.pron || index}')">🎤</button>
        <button onclick="editPhrase(${index})">✏</button>
        <button onclick="deletePhrase(${index})">🗑</button>
      ` : ""}
    `;

    content.appendChild(div);
  });

  // Кнопки админа
  if (adminMode) {
    const addBtn = document.createElement("button");
    addBtn.textContent = "➕ Добавить фразу";
    addBtn.onclick = addPhrase;
    addBtn.style.marginTop = "15px";
    content.appendChild(addBtn);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Сохранить категорию";
    saveBtn.onclick = saveCategory;
    saveBtn.style.marginLeft = "10px";
    content.appendChild(saveBtn);
  }
}

// ================================
// ПРОСЛУШИВАНИЕ АУДИО
// ================================
function playAudio(category, name) {
  const audio = new Audio(`audio/${category}/${name}.webm`);
  audio.play().catch(() => {
    alert("Аудио не найдено");
  });
}

// ================================
// АДМИН ВХОД
// ================================
function adminLogin() {
  const tokenInput = document.getElementById("gh-token");
  const token = tokenInput.value.trim();

  if (!token) {
    alert("Введите GitHub Token");
    return;
  }

  localStorage.setItem("gh_token", token);
  adminMode = true;

  document.getElementById("admin-status").textContent = "✓";
  document.getElementById("admin-status").style.color = "lime";

  if (currentData) renderPhrases();
}

// ================================
// ДОБАВЛЕНИЕ ФРАЗЫ
// ================================
function addPhrase() {
  const ru = prompt("RU:");
  if (ru === null) return;

  const ing = prompt("ING:");
  if (ing === null) return;

  const pron = prompt("PRON (латиница, имя файла):");
  if (pron === null) return;

  currentData.items.push({ ru, ing, pron });
  renderPhrases();
}

// ================================
// РЕДАКТИРОВАНИЕ ФРАЗЫ
// ================================
function editPhrase(index) {
  const item = currentData.items[index];

  const ru = prompt("RU:", item.ru);
  if (ru === null) return;

  const ing = prompt("ING:", item.ing);
  if (ing === null) return;

  const pron = prompt("PRON:", item.pron);
  if (pron === null) return;

  currentData.items[index] = { ru, ing, pron };
  renderPhrases();
}

// ================================
// УДАЛЕНИЕ ФРАЗЫ
// ================================
function deletePhrase(index) {
  if (!confirm("Удалить фразу?")) return;
  currentData.items.splice(index, 1);
  renderPhrases();
}

// ================================
// СОХРАНЕНИЕ JSON В GITHUB
// ================================
async function saveCategory() {
  if (!currentCategory || !currentData) return;

  const token = localStorage.getItem("gh_token");
  if (!token) {
    alert("Нет GitHub Token");
    return;
  }

  await uploadJSONToGitHub(
    `categories/${currentCategory}.json`,
    currentData,
    token
  );

  alert("Категория сохранена в GitHub");
}

// ================================
// ПОИСК
// ================================
async function searchPhrases() {
  const q = document.getElementById("search-input").value.toLowerCase();
  if (q.length < 2) return;

  const content = document.getElementById("content");
  document.getElementById("content-title").innerText = "Результаты поиска";
  content.innerHTML = "";

  for (const cat of categories) {
    try {
      const res = await fetch(`categories/${cat.id}.json`);
      if (!res.ok) continue;

      const data = await res.json();
      data.items.forEach(item => {
        if (
          (item.ru && item.ru.toLowerCase().includes(q)) ||
          (item.ing && item.ing.toLowerCase().includes(q))
        ) {
          const div = document.createElement("div");
          div.className = "phrase";
          div.innerHTML = `
            <h4>${cat.title}</h4>
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>
            <button onclick="playAudio('${cat.id}', '${item.pron}')">🔊</button>
          `;
          content.appendChild(div);
        }
      });
    } catch {}
  }
}

// ================================
// СТАРТ
// ================================
window.onload = loadCategories;
