// ===============================
// Настройки
// ===============================
const CATEGORIES = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting", "danger",
    "thermal", "navigation", "weather", "emotions", "health",
    "help", "commands", "tools", "animals", "time", "numbers",
    "colors", "money", "shop", "city", "village", "guests",
    "communication", "work", "misc"
];

const CATEGORY_TITLES = {
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

// ===============================
// Загрузка категорий
// ===============================
function loadCategories() {
    const list = document.getElementById("category-list");
    if (!list) return;

    CATEGORIES.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-btn";
        btn.textContent = CATEGORY_TITLES[cat] || cat;
        btn.onclick = () => loadCategory(cat);
        list.appendChild(btn);
    });
}

// ===============================
// Загрузка JSON-файла категории
// ===============================
async function loadCategory(categoryName) {
    const content = document.getElementById("content");
    content.innerHTML = `<h2>${CATEGORY_TITLES[categoryName]}</h2>Загрузка...`;

    try {
        const response = await fetch(`dialogues/${categoryName}.json`);

        if (!response.ok) {
            content.innerHTML = `<p style="color:red">Ошибка загрузки: файл не найден</p>`;
            return;
        }

        const json = await response.json();

        // JSON должен содержать ключ "phrases"
        if (!json.phrases || !Array.isArray(json.phrases)) {
            content.innerHTML = `<p style="color:red">Ошибка: неверный формат JSON</p>`;
            return;
        }

        // Рендер
        let html = "";
        json.phrases.forEach(item => {
            html += `
                <div class="phrase">
                    <p><b>RU:</b> ${item.ru}</p>
                    <p><b>ING:</b> ${item.ing}</p>
                    ${item.example ? `<p><i>Пример: ${item.example}</i></p>` : ""}
                    <hr>
                </div>
            `;
        });

        content.innerHTML = html;

    } catch (err) {
        content.innerHTML = `<p style="color:red">Ошибка JSON парсинга</p>`;
        console.error(err);
    }
}

// ===============================
// Поиск (будет дополняться позже)
// ===============================
function searchPhrases() {
    alert("Поиск будет активирован после загрузки всех категорий.");
}

// ===============================
window.onload = () => {
    loadCategories();
};
