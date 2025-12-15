// ==================================================
// ADMIN.JS — ФИНАЛЬНЫЙ
// ==================================================

window.adminMode = false;

// ==================================================
function adminLogin() {
  const tokenInput = document.getElementById("gh-token");
  const status = document.getElementById("admin-status");

  if (!tokenInput || !tokenInput.value) {
    alert("Введите GitHub Token");
    return;
  }

  window.adminMode = true;
  window.githubToken = tokenInput.value.trim();

  status.textContent = "✓ Админ";
  status.style.color = "lime";

  if (currentData) {
    renderPhrases(currentData);
  }
}

// ==================================================
function addPhrase() {
  if (!adminMode) return;

  const ru = prompt("RU:");
  const ing = prompt("ING:");
  const pron = prompt("PRON:");

  if (!ru || !ing || !pron) return;

  currentData.items.push({ ru, ing, pron });
  saveLocal();
  renderPhrases(currentData);
}

// ==================================================
function editPhrase(index) {
  const item = currentData.items[index];

  const ru = prompt("RU:", item.ru);
  const ing = prompt("ING:", item.ing);
  const pron = prompt("PRON:", item.pron);

  if (!ru || !ing || !pron) return;

  currentData.items[index] = { ru, ing, pron };
  saveLocal();
  renderPhrases(currentData);
}

// ==================================================
function deletePhrase(index) {
  if (!confirm("Удалить фразу?")) return;

  currentData.items.splice(index, 1);
  saveLocal();
  renderPhrases(currentData);
}
