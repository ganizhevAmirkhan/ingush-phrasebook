// ======================================
// ПЕРЕМЕННЫЕ
// ======================================

// ⚠️ Список ДОЛЖЕН 1 в 1 совпадать с файлами в categories/
const categories = [
    "greetings",
    "basic_phrases",
    "personal_info",
    "family",
    "home",
    "food",
    "drinks",
    "travel",
    "transport",
    "hunting",
    "danger",
    "thermal",
    "orientation",
    "weather",
    "emotions",
    "health",
    "help",
    "commands",
    "tools",
    "animals",
    "time",
    "numbers",
    "colors",
    "money",
    "shop",
    "city",
    "village",
    "guests",
    "communication",
    "conversation",
    "work",
    "misc"
];

// ⚠️ Эти переменные ОБЪЯВЛЯЮТСЯ ТОЛЬКО ЗДЕСЬ
let currentCategory = null;
let currentData = null;

// безопасная проверка админ-режима
function isAdmin() {
    return typeof window.adminMode !== "undefined" && window.adminMode === true;
}

// ======================================
// ЗАГРУЗКА СПИСКА КАТЕГОРИЙ
// ======================================
function loadCategories() {
    const list = document.getElementById("category-list");
    list.innerHTML = "";

    categories.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category";
        div.textContent = convertCategoryName(cat);
        div.onclick = () => loadCategory(cat);
        list.appendChild(div);
    });
}

// ======================================
// НАЗВАНИЯ КАТЕГОРИЙ
// ======================================
function convertCategoryName(cat) {
    const map = {
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
        orientation: "Ориентация на местности",
        weather: "Погода",
        emotions: "Эмоции",
        health: "Здоровье",
        help: "Помощь",
        commands: "Команды",
        tools: "Инструменты",
        animals: "Животные",
        time: "Время",
        numbers: "Числа",
        colors: "Цвета",
        money: "Деньги",
        shop: "Магазин",
        city: "Город",
        village: "Село",
        guests: "Гости",
        communication: "Общение",
        conversation: "Разговор",
        work: "Работа",
        misc: "Разное"
    };

    return map[cat] || cat;
}

// ======================================
// ЗАГРУЗКА КАТЕГОРИИ
// ======================================
async function loadCategory(category) {
    currentCategory = category;

    const title = document.getElementById("content-title");
    const content = document.getElementById("content");

    title.textContent = convertCategoryName(category);
    content.innerHTML = "<p>Загрузка...</p>";

    try {
        const res = await fetch(`categories/${category}.json`);
        if (!res.ok) throw new Error("Файл не найден");

        const data = await res.json();

        if (!Array.isArray(data.items)) {
            throw new Error("Неверный формат JSON (нет items)");
        }

        currentData = data;
        renderPhrases(data);

    } catch (e) {
        content.innerHTML = `<p style="color:red">Ошибка загрузки: ${e.message}</p>`;
    }
}

// ======================================
// ОТОБРАЖЕНИЕ ФРАЗ
// ======================================
function renderPhrases(data) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    if (!data.items.length) {
        content.innerHTML = "<p>Фразы отсутствуют.</p>";
        return;
    }

    data.items.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "phrase";

        div.innerHTML = `
            <p><b>RU:</b> ${item.ru || ""}</p>
            <p><b>ING:</b> ${item.ing || ""}</p>
            <p><b>PRON:</b> ${item.pron || ""}</p>

            <button onclick="playAudio('${currentCategory}', ${index})">🔊</button>

            ${isAdmin() ? `
                <button onclick="editPhrase(${index})">✏</button>
                <button onclick="deletePhrase(${index})">🗑</button>
                <button onclick="startRecording(${index})">🎤</button>
            ` : ""}
        `;

        content.appendChild(div);
    });

    if (isAdmin()) {
        const addBtn = document.createElement("button");
        addBtn.textContent = "➕ Добавить фразу";
        addBtn.onclick = addPhrase;
        addBtn.style.marginTop = "15px";
        content.appendChild(addBtn);

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "💾 Сохранить категорию";
        saveBtn.onclick = saveCategory;
        saveBtn.style.marginLeft = "10px";
        content.appendChild(saveBtn);
    }
}

// ======================================
// ПОИСК
// ======================================
async function searchPhrases() {
    const q = document.getElementById("search-bar").value.toLowerCase();
    if (q.length < 2) return;

    const content = document.getElementById("content");
    const title = document.getElementById("content-title");

    title.textContent = "Результаты поиска";
    content.innerHTML = "";

    let results = [];

    for (const cat of categories) {
        try {
            const res = await fetch(`categories/${cat}.json`);
            if (!res.ok) continue;

            const data = await res.json();

            data.items.forEach((item, index) => {
                if (
                    (item.ru && item.ru.toLowerCase().includes(q)) ||
                    (item.ing && item.ing.toLowerCase().includes(q))
                ) {
                    results.push({ ...item, cat, index });
                }
            });
        } catch {}
    }

    if (!results.length) {
        content.innerHTML = "<p>Ничего не найдено.</p>";
        return;
    }

    results.forEach(r => {
        const div = document.createElement("div");
        div.className = "phrase";

        div.innerHTML = `
            <h4>${convertCategoryName(r.cat)}</h4>
            <p><b>RU:</b> ${r.ru}</p>
            <p><b>ING:</b> ${r.ing}</p>
            <p><b>PRON:</b> ${r.pron}</p>
            <button onclick="playAudio('${r.cat}', ${r.index})">🔊</button>
        `;

        content.appendChild(div);
    });
}

// ======================================
// АУДИО
// ======================================
function playAudio(category, index) {
    const audio = new Audio(`audio/${category}/${index}.mp3`);
    audio.play().catch(() => {
        alert("Аудиофайл не найден");
    });
}

// ======================================
// СТАРТ
// ======================================
window.addEventListener("load", loadCategories);
