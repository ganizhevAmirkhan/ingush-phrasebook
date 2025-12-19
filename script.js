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

  if (currentView === "search") {
    performSearch(lastSearchQuery);
  } else {
    renderPhrases(currentData.items);
  }
}

// ===============================
// EDIT
// ===============================
function editPhrase(id) {
  const item = currentData.items.find(i => i.id === id);
  if (!item) return;

  const ru = prompt("RU:", item.ru);
  if (ru === null) return;

  const ing = prompt("ING:", item.ing);
  if (ing === null) return;

  const pron = prompt("PRON:", item.pron);
  if (pron === null) return;

  updateItemById(id, { ru, ing, pron });
}

// ===============================
// DELETE
// ===============================
function deletePhrase(id) {
  if (!confirm("Удалить фразу?")) return;

  currentData.items = currentData.items.filter(i => i.id !== id);
  saveCurrentCategory();

  if (currentView === "search") {
    performSearch(lastSearchQuery);
  } else {
    renderPhrases(currentData.items);
  }
}

// ===============================
// ADD
// ===============================
function addPhrase() {
  const ru = prompt("RU:");
  if (!ru) return;

  const ing = prompt("ING:");
  if (!ing) return;

  const pron = prompt("PRON:");
  if (!pron) return;

  const id = "f_" + Date.now();

  currentData.items.push({
    ru, ing, pron, id
  });

  saveCurrentCategory();
  renderPhrases(currentData.items);
}

// ===============================
// SAVE JSON
// ===============================
async function saveCurrentCategory() {
  const token = githubToken;
  if (!token) return;

  const path = `categories/${currentCategory}.json`;
  const url = `https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;
  const check = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  if (check.ok) sha = (await check.json()).sha;

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "update category",
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentData, null, 2)))),
      sha
    })
  });
}
