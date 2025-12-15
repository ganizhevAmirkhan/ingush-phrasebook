// ================================
// НАСТРОЙКИ GITHUB
// ================================
const GITHUB_OWNER = "ganizhevAmirkhan";
const GITHUB_REPO = "ingush-phrasebook";
const GITHUB_BRANCH = "main";

// ================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ================================
window.adminMode = false;
window.githubToken = null;

// ================================
// ВХОД АДМИНА
// ================================
function adminLogin() {
    const pass = prompt("Введите пароль администратора:");
    const tokenInput = document.getElementById("gh-token");
    const token = tokenInput ? tokenInput.value.trim() : "";

    if (pass !== "ingush-secret") {
        alert("Неверный пароль администратора");
        return;
    }

    if (!token) {
        alert("Введите GitHub Token");
        return;
    }

    window.adminMode = true;
    window.githubToken = token;

    const status = document.getElementById("admin-status");
    if (status) status.textContent = "✓ Админ";

    // Перерисовываем текущую категорию, чтобы появились кнопки
    if (window.currentData) {
        renderPhrases(window.currentData);
    }
}

// ================================
// ДОБАВИТЬ ФРАЗУ
// ================================
function addPhrase() {
    if (!window.currentData) {
        alert("Сначала выберите категорию");
        return;
    }

    const ru = prompt("Введите RU фразу:");
    const ing = prompt("Введите ING фразу:");
    const pron = prompt("Введите PRON:");

    if (!ru || !ing || !pron) return;

    window.currentData.items.push({ ru, ing, pron });
    renderPhrases(window.currentData);
}

// ================================
// РЕДАКТИРОВАТЬ ФРАЗУ
// ================================
function editPhrase(index) {
    if (!window.currentData) return;

    const item = window.currentData.items[index];

    const ru = prompt("RU:", item.ru);
    const ing = prompt("ING:", item.ing);
    const pron = prompt("PRON:", item.pron);

    if (!ru || !ing || !pron) return;

    window.currentData.items[index] = { ru, ing, pron };
    renderPhrases(window.currentData);
}

// ================================
// УДАЛИТЬ ФРАЗУ
// ================================
function deletePhrase(index) {
    if (!window.currentData) return;

    if (!confirm("Удалить фразу?")) return;

    window.currentData.items.splice(index, 1);
    renderPhrases(window.currentData);
}

// ================================
// 💾 СОХРАНИТЬ КАТЕГОРИЮ В GITHUB
// ================================
async function saveCategory() {
    if (!window.githubToken) {
        alert("GitHub Token не задан");
        return;
    }

    if (!window.currentCategory || !window.currentData) {
        alert("Категория не выбрана");
        return;
    }

    const path = `categories/${window.currentCategory}.json`;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    let sha = null;

    // 1️⃣ Получаем SHA текущего файла
    const check = await fetch(url, {
        headers: {
            "Authorization": `token ${window.githubToken}`
        }
    });

    if (check.ok) {
        const json = await check.json();
        sha = json.sha;
    }

    // 2️⃣ Подготавливаем контент
    const content = btoa(
        unescape(
            encodeURIComponent(
                JSON.stringify(window.currentData, null, 2)
            )
        )
    );

    // 3️⃣ Загружаем в GitHub
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${window.githubToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: `Update ${window.currentCategory}.json`,
            content: content,
            sha: sha || undefined,
            branch: GITHUB_BRANCH
        })
    });

    if (res.ok) {
        alert("✅ Категория сохранена в GitHub");
    } else {
        const err = await res.json();
        alert("❌ Ошибка сохранения: " + (err.message || "unknown"));
        console.error(err);
    }
}
