// ===== НАСТРОЙКИ РЕПО =====
const GITHUB_OWNER = "ganizhevAmirkhan";
const GITHUB_REPO  = "ingush-phrasebook";
const GITHUB_BRANCH = "main";

window.adminMode = false;
window.githubToken = null;

// ===== ВХОД АДМИНА =====
function adminLogin() {
  const pass = prompt("Введите пароль администратора:");
  const token = document.getElementById("gh-token").value.trim();

  if (pass !== "ingush-secret") {
    alert("Неверный пароль");
    return;
  }
  if (!token) {
    alert("Введите GitHub Token");
    return;
  }

  window.adminMode = true;
  window.githubToken = token;

  document.getElementById("admin-status").textContent = "✓ Админ";
  if (window.currentData) renderPhrases(window.currentData);
}

// ===== ДОБАВИТЬ ФРАЗУ =====
function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON:");

  if (!ru || !ing || !pron) return;

  window.currentData.items.push({ ru, ing, pron });
  renderPhrases(window.currentData);
}

// ===== РЕДАКТИРОВАТЬ =====
function editPhrase(index) {
  const item = window.currentData.items[index];

  const ru = prompt("RU:", item.ru);
  const ing = prompt("ING:", item.ing);
  const pron = prompt("PRON:", item.pron);

  if (!ru || !ing || !pron) return;

  window.currentData.items[index] = { ru, ing, pron };
  renderPhrases(window.currentData);
}

// ===== УДАЛИТЬ =====
function deletePhrase(index) {
  if (!confirm("Удалить фразу?")) return;
  window.currentData.items.splice(index, 1);
  renderPhrases(window.currentData);
}

// ===== СОХРАНИТЬ JSON В GITHUB =====
async function saveCategory() {
  const path = `categories/${window.currentCategory}.json`;
  const content = btoa(unescape(encodeURIComponent(
    JSON.stringify(window.currentData, null, 2)
  )));

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `token ${window.githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Update ${window.currentCategory}.json`,
        content,
        branch: GITHUB_BRANCH
      })
    }
  );

  if (res.ok) alert("JSON сохранён в GitHub");
  else alert("Ошибка сохранения JSON");
}
