let categories = {};
let currentCategory = null;
let currentData = null;
let currentView = "category"; // category | search
let searchResults = [];

const categoriesList = document.getElementById("categories");
const content = document.getElementById("content");
const searchInput = document.getElementById("searchInput");

/* =========================
   INIT
========================= */

async function init() {
  await preloadAllCategories();
  renderCategories();
}
init();

/* =========================
   LOAD JSON
========================= */

async function preloadAllCategories() {
  const files = [
    "basic_phrases","greetings","family","home","food","drinks","travel",
    "transport","health","help","commands","tools","animals","time",
    "numbers","weather","emotions","colors","money","shop","city","village",
    "guests","communication","work","misc","hunting"
  ];

  for (const name of files) {
    const res = await fetch(`categories/${name}.json`);
    if (res.ok) categories[name] = await res.json();
  }
}

/* =========================
   RENDER CATEGORY LIST
========================= */

function renderCategories() {
  categoriesList.innerHTML = "";
  Object.keys(categories).forEach(cat => {
    const btn = document.createElement("button");
    btn.textContent = categories[cat].category;
    btn.onclick = () => openCategory(cat);
    categoriesList.appendChild(btn);
  });
}

/* =========================
   OPEN CATEGORY
========================= */

function openCategory(cat) {
  currentCategory = cat;
  currentData = categories[cat];
  currentView = "category";
  renderPhrases(currentData.items);
}

/* =========================
   SEARCH
========================= */

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;

  searchResults = [];
  currentView = "search";

  Object.entries(categories).forEach(([cat, data]) => {
    data.items.forEach(item => {
      if (
        item.ru.toLowerCase().includes(q) ||
        item.ing.toLowerCase().includes(q) ||
        item.pron.toLowerCase().includes(q)
      ) {
        searchResults.push({ ...item, _cat: cat });
      }
    });
  });

  renderPhrases(searchResults);
}

/* =========================
   RENDER PHRASES
========================= */

function renderPhrases(list) {
  content.innerHTML = "";

  list.forEach(item => {
    const hasAudio = !!item.audio;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <b>ING:</b> ${item.ing}<br>
      <b>RU:</b> ${item.ru}<br>
      <b>PRON:</b> ${item.pron}<br>
      <div class="controls">
        <button ${!hasAudio ? "disabled" : ""} onclick="playAudio('${item._cat || currentCategory}','${item.audio}')">▶</button>
        <button onclick="startRecording('${item._cat || currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editById('${item.id}')">✏</button>
      </div>
    `;

    card.querySelector("button").style.background =
      hasAudio ? "green" : "gray";

    content.appendChild(card);
  });
}

/* =========================
   PLAY AUDIO
========================= */

function playAudio(cat, file) {
  if (!file) return;

  const audio = new Audio(`audio/${cat}/${file}`);
  audio.play().catch(() => alert("Ошибка воспроизведения"));
}

/* =========================
   EDIT
========================= */

async function editById(id) {
  let catFound = null;
  let item = null;

  Object.entries(categories).forEach(([cat, data]) => {
    data.items.forEach(i => {
      if (i.id === id) {
        catFound = cat;
        item = i;
      }
    });
  });

  if (!item) return;

  const ru = prompt("RU:", item.ru);
  const ing = prompt("ING:", item.ing);
  const pron = prompt("PRON:", item.pron);

  if (ru !== null) item.ru = ru;
  if (ing !== null) item.ing = ing;
  if (pron !== null) item.pron = pron;

  await saveCategory(catFound);

  renderCurrentView();

  // 🔄 если мы в поиске — пересобрать результаты
  if (currentView === "search") {
    doSearch();
  }
}

/* =========================
   SAVE JSON (GitHub API)
========================= */

async function saveCategory(cat) {
  const token = githubToken;
  if (!token) return alert("Нет GitHub Token");

  const data = categories[cat];
  const path = `categories/${cat}.json`;
  const url = `https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;

  const res = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  const json = await res.json();

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `update ${cat}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
      sha: json.sha
    })
  });
}

/* =========================
   VIEW RENDER
========================= */

function renderCurrentView() {
  if (currentView === "category" && currentData) {
    renderPhrases(currentData.items);
  }
  if (currentView === "search") {
    renderPhrases(searchResults);
  }
}
