// НИЧЕГО не объявляем заново: ни currentCategory, ни currentData!

function adminLogin() {
  const pass = prompt("Введите пароль администратора:");
  if (pass === "ingush-secret") {
    window.adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
    if (window.currentData) renderPhrases(window.currentData);
  } else {
    alert("Неверный пароль.");
  }
}

function editPhrase(index) {
  if (!window.currentData) return alert("Сначала открой категорию.");
  const item = window.currentData.items[index];

  const ru = prompt("RU:", item.ru ?? "");
  const ing = prompt("ING:", item.ing ?? "");
  const pron = prompt("PRON:", item.pron ?? "");

  if (ru === null || ing === null || pron === null) return;

  window.currentData.items[index] = { ru, ing, pron };
  renderPhrases(window.currentData);
}

function deletePhrase(index) {
  if (!window.currentData) return alert("Сначала открой категорию.");
  if (!confirm("Удалить фразу?")) return;

  window.currentData.items.splice(index, 1);
  renderPhrases(window.currentData);
}

function addPhrase() {
  if (!window.currentData) return alert("Сначала открой категорию.");

  const ru = prompt("Введите RU фразу:");
  const ing = prompt("Введите ING фразу:");
  const pron = prompt("Введите PRON:");

  if (!ru || !ing || !pron) return;

  window.currentData.items.push({ ru, ing, pron });
  renderPhrases(window.currentData);
}

function saveCategory() {
  if (!window.currentData || !window.currentCategory) return alert("Сначала открой категорию.");

  const blob = new Blob([JSON.stringify(window.currentData, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${window.currentCategory}.json`;
  a.click();
}
