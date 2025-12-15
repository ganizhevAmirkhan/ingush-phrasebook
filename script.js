const categories = [
  "greetings","basic_phrases","personal_info","family","home",
  "food","drinks","travel","transport","hunting",
  "danger","thermal","orientation","weather","emotions",
  "health","help","commands","tools","animals",
  "time","numbers","colors","money","shop",
  "city","village","guests","communication","work","misc"
];

window.currentCategory = null;
window.currentData = null;

window.onload = loadCategories;

// =========================
function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat => {
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = cat;
    d.onclick = () => loadCategory(cat);
    list.appendChild(d);
  });
}

// =========================
async function loadCategory(cat) {
  currentCategory = cat;
  document.getElementById("content-title").textContent = cat;

  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  renderPhrases(currentData);
}

// =========================
function renderPhrases(data) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  data.items.forEach((item, i) => {
    const hasLocal = localStorage.getItem(`audio_${currentCategory}_${i}`);
    const icon = hasLocal ? "🟢" : "⚪";

    const div = document.createElement("div");
    div.className = "phrase";
    div.innerHTML = `
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${currentCategory}',${i})">🔊</button>
      <span>${icon}</span>

      ${window.adminMode ? `
        <button onclick="startRecording(${i})">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      ` : ""}
    `;
    content.appendChild(div);
  });
}

// =========================
// 🔊 PLAY (local → pages)
function playAudio(cat, index) {
  const local = localStorage.getItem(`audio_${cat}_${index}`);
  if (local) {
    new Audio(local).play();
    return;
  }

  const url = `audio/${cat}/${index}.webm?v=${Date.now()}`;
  new Audio(url).play().catch(() =>
    alert("Аудио ещё обновляется на GitHub Pages")
  );
}
