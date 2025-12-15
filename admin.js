window.adminMode = false;
window.githubToken = null;

function adminLogin() {
  const pass = prompt("Пароль:");
  const token = document.getElementById("gh-token").value;

  if (pass !== "ingush-secret") return alert("Неверный пароль");
  if (!token) return alert("Введите GitHub Token");

  adminMode = true;
  githubToken = token;
  document.getElementById("admin-status").textContent = "✓ Админ";

  if (currentData) renderPhrases(currentData);
}

// =========================
function addPhrase() {
  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON:");
  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  renderPhrases(currentData);
  saveCategory();
}

function editPhrase(i) {
  const it = currentData.items[i];
  it.ru = prompt("RU", it.ru);
  it.ing = prompt("ING", it.ing);
  it.pron = prompt("PRON", it.pron);

  renderPhrases(currentData);
  saveCategory();
}

function deletePhrase(i) {
  if (!confirm("Удалить?")) return;
  currentData.items.splice(i,1);
  renderPhrases(currentData);
  saveCategory();
}

// =========================
async function saveCategory() {
  const path = `categories/${currentCategory}.json`;
  const url = `https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{
    headers:{Authorization:`token ${githubToken}`}
  });
  if (check.ok) sha = (await check.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Update ${currentCategory}`,
      content:btoa(unescape(encodeURIComponent(JSON.stringify(currentData,null,2)))),
      sha
    })
  });
}
