// ===============================
// GLOBAL STATE (ОСНОВА — НЕ ТРОГАЕМ)
// ===============================
let currentCategory = null;
let currentData = null;
let currentView = "category"; // category | search
let lastSearchQuery = "";
let allDataCache = {};

// ===============================
// LOAD CATEGORY
// ===============================
async function loadCategory(category) {
  currentCategory = category;
  currentView = "category";

  const res = await fetch(`categories/${category}.json`);
  currentData = await res.json();

  renderPhrases(currentData.items);
}

// ===============================
// SEARCH
// ===============================
async function performSearch(query) {
  lastSearchQuery = query;
  currentView = "search";

  if (!query) {
    document.getElementById("content").innerHTML = "";
    return;
  }

  if (Object.keys(allDataCache).length === 0) {
    await preloadAllCategories();
  }

  const results = [];

  for (const [cat, data] of Object.entries(allDataCache)) {
    data.items.forEach(item => {
      if (
        item.ru.toLowerCase().includes(query.toLowerCase()) ||
        item.ing.toLowerCase().includes(query.toLowerCase()) ||
        item.pron.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({ ...item, _category: cat });
      }
    });
  }

  renderPhrases(results);
}

async function preloadAllCategories() {
  const cats = document.querySelectorAll(".category-btn");
  for (const btn of cats) {
    const cat = btn.dataset.category;
    const res = await fetch(`categories/${cat}.json`);
    allDataCache[cat] = await res.json();
  }
}

// ===============================
// RENDER
// ===============================
function renderPhrases(items) {
  const container = document.getElementById("content");
  container.innerHTML = "";

  items.forEach(item => {
    container.appendChild(renderPhrase(item));
  });
}

function renderPhrase(item) {
  const div = document.createElement("div");
  div.className = "phrase";

  const hasAudio = !!item.audio;

  div.innerHTML = `
    <div><b>ING:</b> ${item.ing}</div>
    <div><b>RU:</b> ${item.ru}</div>
    <div><b>PRON:</b> ${item.pron}</div>
    <div>${item._category || currentCategory}</div>

    <button class="play-btn ${hasAudio ? "has-audio" : ""}"
      ${hasAudio ? "" : "disabled"}
      onclick="playAudio('${item._category || currentCategory}', '${item.audio || ""}')">
      ▶
    </button>

    <button onclick="editPhrase('${item.id}')">✏</button>
    <button onclick="deletePhrase('${item.id}')">🗑</button>
  `;

  return div;
}

// ===============================
// AUDIO
// ===============================
function playAudio(category, file) {
  if (!file) return;

  const audio = new Audio(`audio/${category}/${file}`);
  audio.play();
}

// ===============================
// 🔑 ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ
// ===============================
function updateItemById(id, patch) {
  if (!currentData || !currentData.items) return;

  const item = currentData.items.find(i => i.id === id);
  if (!item) return;

  Object.assign(item, patch);

  saveCurrentCategory();

  if (current
