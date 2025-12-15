// ======================================
// ПЕРЕМЕННЫЕ
// ======================================
let categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting",
    "danger", "thermal", "navigation", "weather", "emotions",
    "health", "help", "commands", "tools", "animals",
    "time", "numbers", "colors", "money", "shop",
    "city", "village", "guests", "communication", "work",
    "misc"
];

let currentCategory = null;
let currentData = null;

// ======================================
// ЗАГРУЗКА СПИСКА КАТЕГОРИЙ
// ======================================
function loadCategories() {
    const list = document.getElementById("category-list");
    list.innerHTML = "";

    categories.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category";
        div.innerText = convertCategoryName(cat);
        div.onclick = () => loadCategory(cat);
        list.appendChild(div);
    });
}

// Русские названия категорий
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
        navigation: "Ориентация на местности",
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
        work: "Работа",
        misc: "Разное"
    };

    return map[cat] ?? cat;
}

// ======================================
// ЗАГРУЗКА КАТЕГОРИИ
// ======================================
async function loadCategory(category) {
    currentCategory = category;

    document.getElementById("content-title").innerText = convertCategoryName(category);
    const content = document.getElementById("content");
    content.innerHTML = "<p>Загрузка...</p>";

    try {
        const res = await fetch(`categories/${category}.json`);
        if (!res.ok) throw new Error("Файл не найден");

        const data = await res.json();

        if (!data.items || !Array.isArray(data.items)) {
            throw new Error("JSON неверного формата (нет items[])");
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

    data.items.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "phrase";

        div.innerHTML = `
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>

            <button onclick="playAudio('${currentCategory}', ${index})">🔊</button>

            ${adminMode ? `
                <button onclick="editPhrase(${index})">✏</button>
                <button onclick="deletePhrase(${index})">🗑</button>
                <button onclick="startRecording('${index}')">🎤</button>
            ` : ""}
        `;

        content.appendChild(div);
    });

    if (adminMode) {
        let addBtn = document.createElement("button");
        addBtn.innerText = "➕ Добавить фразу";
        addBtn.onclick = addPhrase;
        addBtn.style = "margin-top:15px; padding:8px;";
        content.appendChild(addBtn);

        let saveBtn = document.createElement("button");
        saveBtn.innerText = "💾 Сохранить категорию";
        saveBtn.onclick = saveCategory;
        saveBtn.style = "margin-left:15px; padding:8px;";
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
    document.getElementById("content-title").innerText = "Результаты поиска";
    content.innerHTML = "";

    let results = [];

    for (let cat of categories) {
        try {
            const res = await fetch(`categories/${cat}.json`);
            if (!res.ok) continue;

            const data = await res.json();
            const items = data.items;

            items.forEach((item, index) => {
                if (item.ru.toLowerCase().includes(q) || item.ing.toLowerCase().includes(q)) {
                    results.push({ ...item, cat, index });
                }
            });

        } catch {}
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
// ОЗВУЧКА MP3
// ======================================
function playAudio(category, index) {
    const audio = new Audio(`audio/${category}/${index}.mp3`);
    audio.play().catch(() => alert("Аудиофайл не найден"));
}

// ======================================
// СТАРТ
// ======================================
window.onload = loadCategories;
