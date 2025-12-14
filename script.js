// ===============================
//     НАСТРОЙКИ
// ===============================
const config = {
    owner: "ganizhevAmirkhan",
    repo: "ingush-phrasebook",
    branch: "main",
    admin_password: "ingush-secret"
};

// ===============================
//     СПИСОК КАТЕГОРИЙ (РУССКИЕ ИМЕНА + ФАЙЛЫ)
// ===============================
const categories = [
    { file: "greetings",         name: "Приветствия" },
    { file: "basic_phrases",     name: "Основные фразы" },
    { file: "personal_info",     name: "Личные данные" },
    { file: "family",            name: "Семья" },
    { file: "home",              name: "Дом и быт" },
    { file: "food",              name: "Еда" },
    { file: "drinks",            name: "Питьё" },
    { file: "travel",            name: "Путешествия" },
    { file: "transport",         name: "Транспорт" },
    { file: "hunting",           name: "Охота" },
    { file: "danger",            name: "Опасность" },
    { file: "thermal",           name: "Тепловизор / наблюдение" },
    { file: "navigation",        name: "Ориентация на местности" },
    { file: "weather",           name: "Погода" },
    { file: "emotions",          name: "Эмоции / состояния" },
    { file: "health",            name: "Здоровье" },
    { file: "help",              name: "Просьбы о помощи" },
    { file: "commands",          name: "Команды" },
    { file: "tools",             name: "Инструменты" },
    { file: "animals",           name: "Животные" },
    { file: "time",              name: "Время" },
    { file: "numbers",           name: "Числа" },
    { file: "colors",            name: "Цвета" },
    { file: "money",             name: "Деньги" },
    { file: "shop",              name: "В магазине" },
    { file: "city",              name: "В городе" },
    { file: "village",           name: "В селе" },
    { file: "guests",            name: "Приём гостей" },
    { file: "communication",     name: "Общение (разговорные фразы)" },
    { file: "work",              name: "Работа" },
    { file: "misc",              name: "Разное" }
];

// ===============================
//     ЗАГРУЗКА КАТЕГОРИЙ В ЛЕВОЕ МЕНЮ
// ===============================
function loadCategories() {
    const list = document.getElementById("category-list");
    if (!list) return;

    list.innerHTML = "";

    categories.forEach(cat => {
        let div = document.createElement("div");
        div.className = "category-button";
        div.innerText = cat.name;
        div.onclick = () => loadCategory(cat.file);
        list.appendChild(div);
    });
}

// ===============================
//     ЗАГРУЗКА СОДЕРЖИМОГО КАТЕГОРИИ
// ===============================
async function loadCategory(categoryFile) {
    const content = document.getElementById("content");
    const title = document.getElementById("content-title");

    const categoryObj = categories.find(c => c.file === categoryFile);
    if (!categoryObj) return;

    title.innerText = categoryObj.name;
    content.innerHTML = "Загрузка…";

    const url = `categories/${categoryFile}.json`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            content.innerHTML = `<span style="color:red;">Ошибка загрузки: Файл не найден</span>`;
            return;
        }

        const data = await response.json();

        let html = "";
        data.forEach(item => {
            html += `
                <div class="phrase-card">
                    <div class="phrase-rus">${item.rus}</div>
                    <div class="phrase-ing">${item.ing}</div>
                    <button class="play-btn" onclick="playAudio('${item.ing}')">🔊</button>
                </div>
            `;
        });

        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = `<span style="color:red;">Ошибка чтения файла</span>`;
    }
}

// ===============================
//     ПОИСК ПО ВСЕМ CATEGORIES/*.json
// ===============================
async function searchPhrases() {
    const query = document.getElementById("search-box").value.trim().toLowerCase();
    const content = document.getElementById("content");
    const title = document.getElementById("content-title");

    if (!query) return;

    title.innerText = "Результаты поиска";
    content.innerHTML = "Поиск…";

    let results = [];

    for (let cat of categories) {
        try {
            const response = await fetch(`categories/${cat.file}.json`);
            if (!response.ok) continue;

            const data = await response.json();

            data.forEach(item => {
                if (item.rus.toLowerCase().includes(query) || item.ing.toLowerCase().includes(query)) {
                    results.push({ ...item, category: cat.name });
                }
            });
        } catch {}
    }

    if (results.length === 0) {
        content.innerHTML = "Ничего не найдено.";
        return;
    }

    let html = "";
    results.forEach(r => {
        html += `
            <div class="phrase-card">
                <div class="phrase-category">${r.category}</div>
                <div class="phrase-rus">${r.rus}</div>
                <div class="phrase-ing">${r.ing}</div>
                <button class="play-btn" onclick="playAudio('${r.ing}')">🔊</button>
            </div>
        `;
    });

    content.innerHTML = html;
}

// ===============================
//     ПРОСМОТР АУДИО
// ===============================
function playAudio(text) {
    const file = text.replace(/[^a-zA-Z0-9]/g, "_") + ".mp3";
    const audio = new Audio(`audio/${file}`);
    audio.play().catch(() => alert("Аудио отсутствует"));
}

// ===============================
//     АВТОРИЗАЦИЯ
// ===============================
function login() {
    const pwd = prompt("Введите пароль администратора:");

    if (pwd === config.admin_password) {
        document.body.classList.add("admin");
        alert("Авторизация успешна!");
    } else {
        alert("Неверный пароль");
    }
}

window.onload = () => {
    loadCategories();
};
