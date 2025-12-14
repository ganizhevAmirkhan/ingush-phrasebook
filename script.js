// ==== МАППИНГ КАТЕГОРИЙ ====
const CATEGORY_MAP = {
    "Приветствия": "greetings",
    "Основные фразы": "basic_phrases",
    "Личные данные": "personal_info",
    "Семья": "family",
    "Дом и быт": "home",
    "Еда": "food",
    "Питьё": "drinks",
    "Путешествия": "travel",
    "Транспорт": "transport",
    "Охота": "hunting",
    "Опасность": "danger",
    "Тепловизор / наблюдение": "thermal",
    "Ориентация на местности": "navigation",
    "Погода": "weather",
    "Эмоции / состояния": "emotions",
    "Здоровье": "health",
    "Просьбы о помощи": "help",
    "Команды": "commands",
    "Инструменты": "tools",
    "Животные": "animals",
    "Время": "time",
    "Числа": "numbers",
    "Цвета": "colors",
    "Деньги": "money",
    "В магазине": "shop",
    "В городе": "city",
    "В селе": "village",
    "Приём гостей": "guests",
    "Общение": "communication",
    "Работа": "work",
    "Разное": "misc"
};

// ==== ЗАГРУЗКА СПИСКА КАТЕГОРИЙ ====
function loadCategories() {
    const list = document.getElementById("category-list");
    list.innerHTML = "";

    Object.keys(CATEGORY_MAP).forEach(name => {
        const btn = document.createElement("button");
        btn.textContent = name;
        btn.className = "category-btn";
        btn.onclick = () => loadCategory(CATEGORY_MAP[name]);
        list.appendChild(btn);
    });
}

// ==== ЗАГРУЗКА ОДНОЙ КАТЕГОРИИ ====
async function loadCategory(fileName) {
    const content = document.getElementById("content");
    content.innerHTML = `<p>Загрузка...</p>`;

    try {
        const response = await fetch(`categories/${fileName}.json`);
        if (!response.ok) throw new Error("Файл не найден");

        const data = await response.json();
        renderCategory(data);

    } catch (err) {
        content.innerHTML = `<p style="color:red">Ошибка загрузки: файл не найден</p>`;
    }
}

// ==== ОТОБРАЖЕНИЕ ФРАЗ ====
function renderCategory(data) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    data.forEach(item => {
        const block = document.createElement("div");
        block.className = "phrase-block";

        block.innerHTML = `
            <p class="rus">${item.rus}</p>
            <p class="ing">${item.ing}</p>
        `;

        content.appendChild(block);
    });
}

// ==== ГЛОБАЛЬНЫЙ ПОИСК ====
document.getElementById("search").addEventListener("input", async function () {
    const q = this.value.trim().toLowerCase();
    const content = document.getElementById("content");

    if (!q) {
        content.innerHTML = "<p>Введите фразу...</p>";
        return;
    }

    let results = [];

    for (const file of Object.values(CATEGORY_MAP)) {
        try {
            const res = await fetch(`categories/${file}.json`);
            if (!res.ok) continue;

            const data = await res.json();
            data.forEach(item => {
                if (item.rus.toLowerCase().includes(q) || item.ing.toLowerCase().includes(q)) {
                    results.push(item);
                }
            });
        } catch { }
    }

    if (results.length === 0) {
        content.innerHTML = "<p>Ничего не найдено...</p>";
        return;
    }

    content.innerHTML = results
        .map(item => `
            <div class="phrase-block">
                <p class="rus">${item.rus}</p>
                <p class="ing">${item.ing}</p>
            </div>
        `)
        .join("");
});

// ==== СТАРТ ====
window.onload = () => {
    loadCategories();
};
