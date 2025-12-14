// === ГЛАВНАЯ КОНФИГУРАЦИЯ ===
const RAW_ROOT = "https://raw.githubusercontent.com/ganizhevAmirkhan/ingush-phrasebook/main/categories/";
const ADMIN_PASSWORD = "ingush-secret";

// === МАППИНГ: имя файла → имя категории на русском ===
const CATEGORY_NAMES = {
    greetings: "Приветствия",
    basic_phrases: "Основные фразы",
    personal_info: "Личные данные",
    family: "Семья",
    home: "Дом и быт",
    food: "Еда",
    drinks: "Питьё",
    travel: "Путешествия",
    transport: "Транспорт",
    hunting: "Охота",
    danger: "Опасность",
    thermal: "Тепловизор / наблюдение",
    navigation: "Ориентация на местности",
    weather: "Погода",
    emotions: "Эмоции / состояния",
    health: "Здоровье",
    help: "Просьбы о помощи",
    commands: "Команды",
    tools: "Инструменты",
    animals: "Животные",
    time: "Время",
    numbers: "Числа",
    colors: "Цвета",
    money: "Деньги",
    shop: "В магазине",
    city: "В городе",
    village: "В селе",
    guests: "Приём гостей",
    communication: "Общение",
    work: "Работа",
    misc: "Разное"
};

// === Функция загрузки файла JSON ===
async function loadCategoryJSON(filename) {
    try {
        const response = await fetch(RAW_ROOT + filename);
        if (!response.ok) throw new Error("404 Not Found");

        return await response.json();
    } catch (e) {
        return { error: true, message: e.message };
    }
}

// === Инициализация меню ===
async function loadCategories() {
    const menu = document.getElementById("categories");
    if (!menu) return;

    menu.innerHTML = "";

    // Получаем список файлов из GitHub API
    const api = await fetch("https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/categories");
    const files = await api.json();

    files.forEach(file => {
        if (!file.name.endsWith(".json")) return;
        if (file.name.includes("requests")) return; // игнор мусорного файла

        const key = file.name.replace(".json", "");
        const title = CATEGORY_NAMES[key] || key;

        const btn = document.createElement("button");
        btn.classList.add("category-btn");
        btn.innerText = title;

        btn.onclick = () => openCategory(key, file.name);

        menu.appendChild(btn);
    });
}

// === Показать содержимое категории ===
async function openCategory(key, filename) {
    const box = document.getElementById("content");
    box.innerHTML = `<h2>${CATEGORY_NAMES[key] || key}</h2>`;

    const data = await loadCategoryJSON(filename);

    if (data.error || !Array.isArray(data)) {
        box.innerHTML += `<p style="color:red">Ошибка загрузки: файл повреждён или пустой</p>`;
        return;
    }

    data.forEach(item => {
        const div = document.createElement("div");
        div.classList.add("phrase-item");

        div.innerHTML = `
            <div class="phrase-ru">${item.ru || ""}</div>
            <div class="phrase-ing">${item.ing || ""}</div>
        `;

        box.appendChild(div);
    });
}

// === Поиск по всем JSON ===
async function globalSearch(query) {
    const box = document.getElementById("content");
    box.innerHTML = `<h2>Результаты поиска</h2>`;

    const api = await fetch("https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/categories");
    const files = await api.json();

    let results = [];

    for (const file of files) {
        if (!file.name.endsWith(".json")) continue;
        if (file.name.includes("requests")) continue;

        const data = await loadCategoryJSON(file.name);
        if (!Array.isArray(data)) continue;

        const matched = data.filter(item =>
            item.ru?.toLowerCase()?.includes(query) ||
            item.ing?.toLowerCase()?.includes(query)
        );

        results.push(...matched);
    }

    if (results.length === 0) {
        box.innerHTML += `<p>Ничего не найдено</p>`;
        return;
    }

    results.forEach(item => {
        const div = document.createElement("div");
        div.classList.add("phrase-item");
        div.innerHTML = `
            <div class="phrase-ru">${item.ru}</div>
            <div class="phrase-ing">${item.ing}</div>
        `;
        box.appendChild(div);
    });
}

// === Инициализация сайта ===
window.onload = loadCategories;
