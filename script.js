let adminMode = false;
let currentCategory = null;
let currentData = null;

function adminLogin() {
  const token = document.getElementById("gh-token").value;
  setToken(token);
  adminMode = true;
  document.getElementById("admin-status").textContent = "✔";
}

async function loadCategory(cat) {
  currentCategory = cat;
  const res = await fetch(`categories/${cat}.json`);
  currentData = await res.json();
  render();
}

function render() {
  const c = document.getElementById("content");
  c.innerHTML = "";

  currentData.items.forEach((p) => {
    const div = document.createElement("div");
    div.className = "phrase";

    div.innerHTML = `
      <b>RU:</b> ${p.ru}<br>
      <b>ING:</b> ${p.ing}<br>
      <b>PRON:</b> ${p.pron}<br>

      <button onclick="playAudio('${currentCategory}','${p.pron}')">🔊</button>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory}','${p.pron}')">🎤</button>
        <button onclick="stopRecording()">⏹</button>
      ` : ""}
    `;

    c.appendChild(div);
  });

  if (adminMode) {
    const btn = document.createElement("button");
    btn.textContent = "💾 Сохранить категорию";
    btn.onclick = saveCategory;
    c.appendChild(btn);
  }
}

function playAudio(cat, pron) {
  const a = new Audio(`audio/${cat}/${pron}.webm`);
  a.play().catch(() => alert("Аудио не найдено"));
}

async function saveCategory() {
  await githubPut(
    `categories/${currentCategory}.json`,
    JSON.stringify(currentData, null, 2),
    `Update ${currentCategory}`
  );
  alert("Категория сохранена в GitHub");
}
