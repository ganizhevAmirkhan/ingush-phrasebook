// ======================================
// ПЕРЕМЕННЫЕ
// ======================================
const categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting",
    "danger", "thermal", "orientation", "weather", "emotions",
    "health", "help", "commands", "tools", "animals",
    "time", "numbers", "colors", "money", "shop",
    "city", "village", "guests", "communication", "work",
    "misc"
];

window.currentCategory = null;
window.currentData = null;

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
// НАЗВАНИЯ КАТЕГОРИЙ (RU)
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
        work: "Работа",
        misc: "Разное"
    };
    return map[cat] || cat;
}

// ======================================
// ЗАГРУЗКА КАТЕГОРИИ
// ======================================
async function loadCategory(category) {
    window.currentCategory = category;

    document.getElementById("content-title").textContent =
        convertCategoryName(category);

    const content = document.getElementById("content");
    content.innerHTML = "<p>Загрузка...</p>";

    try {
        const res = await fetch(`categories/${category}.json`);
        if (!res.ok) throw new Error("Файл не найден");

        const data = await res.json();
        if (!Array.isArray(data.items)) {
            throw new Error("Неверный формат JSON");
        }

        window.currentData = data;
        renderPhrases(data);

    } catch (e) {
        content.innerHTML =
            `<p style="color:red">Ошибка загрузки: ${e.message}</p>`;
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

            <button onclick="playAudio('${window.currentCategory}', ${index})">🔊</button>

            ${window.adminMode ? `
                <button onclick="editPhrase(${index})">✏</button>
                <button onclick="deletePhrase(${index})">🗑</button>
                <button onclick="startRecording(${index})">🎤</button>
            ` : ""}
        `;

        content.appendChild(div);
    });

    // ==============================
    // КНОПКИ АДМИНА
    // ==============================
    if (window.adminMode) {
        const panel = document.createElement("div");
        panel.style.marginTop = "20px";

        const addBtn = document.createElement("button");
        addBtn.textContent = "➕ Добавить фразу";
        addBtn.onclick = addPhrase;

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "💾 Сохранить категорию";
        saveBtn.onclick = saveCategory;
        saveBtn.style.marginLeft = "10px";

        panel.appendChild(addBtn);
        panel.appendChild(saveBtn);
        content.appendChild(panel);
    }
}

// ======================================
// ПОИСК
// ======================================
async function searchPhrases() {
    const q = document.getElementById("search-bar").value.toLowerCase();
    if (q.length < 2) return;

    const content = document.getElementById("content");
    document.getElementById("content-title").textContent =
        "Результаты поиска";

    content.innerHTML = "";

    for (const cat of categories) {
        try {
            const res = await fetch(`categories/${cat}.json`);
            if (!res.ok) continue;

            const data = await res.json();

            data.items.forEach((item, index) => {
                if (
                    item.ru.toLowerCase().includes(q) ||
                    item.ing.toLowerCase().includes(q)
                ) {
                    const div = document.createElement("div");
                    div.className = "phrase";

                    div.innerHTML = `
                        <h4>${convertCategoryName(cat)}</h4>
                        <p><b>RU:</b> ${item.ru}</p>
                        <p><b>ING:</b> ${item.ing}</p>
                        <p><b>PRON:</b> ${item.pron}</p>
                        <button onclick="playAudio('${cat}', ${index})">🔊</button>
                    `;
                    content.appendChild(div);
                }
            });

        } catch (e) {}
    }
}

// ======================================
// 🔊 ПРОИГРЫВАНИЕ АУДИО (WEBM)
// ======================================
function playAudio(category, index) {
    const audio = new Audio(`audio/${category}/${index}.webm`);
    audio.play().catch(() => {
        alert("Аудиофайл отсутствует");
    });
}

// ======================================
// СТАРТ
// ======================================
window.onload = loadCategories;
