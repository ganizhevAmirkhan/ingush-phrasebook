<script>
// =========================
//   СПИСОК КАТЕГОРИЙ + РУССКИЕ НАЗВАНИЯ
// =========================

const categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting",
    "danger", "thermal", "navigation", "weather", "emotions",
    "health", "help", "commands", "tools", "animals",
    "time", "numbers", "colors", "money", "shop",
    "city", "village", "guests", "communication", "work",
    "misc"
];

const categoryNames = {
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

let adminMode = false;

// =========================
//   КНОПКА "АДМИНКА"
// =========================

function goToAdmin() {
    window.location.href = "admin/admin.html";
}

// =========================
//   ЗАГРУЗКА КАТЕГОРИЙ
// =========================

function loadCategories() {
    const list = document.getElementById("category-list");
    list.innerHTML = "";

    categories.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category";
        div.innerText = categoryNames[cat];
        div.onclick = () => loadCategory(cat);
        list.appendChild(div);
    });
}

async function loadCategory(category) {
    document.getElementById("content-title").innerText = categoryNames[category];

    const url = `categories/${category}.json`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Файл не найден");

        const data = await res.json(); 

        renderPhrases(data);

    } catch (e) {
        document.getElementById("content").innerHTML =
            `<p style="color:red">Ошибка: ${e.message}</p>`;
    }
}

// =========================
//   ОТОБРАЖЕНИЕ ФРАЗ
// =========================

function renderPhrases(data) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    const items = Array.isArray(data) ? data : data.items;

    if (!items || !Array.isArray(items)) {
        content.innerHTML = "<p style='color:red'>Неверный формат JSON</p>";
        return;
    }

    items.forEach(item => {
        const block = document.createElement("div");
        block.className = "phrase";

        block.innerHTML = `
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>
        `;

        content.appendChild(block);
    });
}

// =========================
//   ПОИСК
// =========================

async function searchPhrases() {
    const q = document.getElementById("search-bar").value.toLowerCase();
    if (q.length < 2) return;

    let results = [];

    for (const cat of categories) {
        try {
            const res = await fetch(`categories/${cat}.json`);
            if (!res.ok) continue;

            const data = await res.json();
            const items = Array.isArray(data) ? data : data.items;

            items.forEach(item => {
                if (
                    item.ru.toLowerCase().includes(q) ||
                    item.ing.toLowerCase().includes(q)
                ) {
                    results.push(item);
                }
            });

        } catch {}
    }

    document.getElementById("content-title").innerText = "Поиск:";
    renderPhrases(results);
}

// =========================
//   ВХОД АДМИНА
// =========================

function adminLogin() {
    let pass = prompt("Введите пароль администратора:");

    if (pass === "ingush-secret") {
        adminMode = true;
        document.getElementById("admin-status").innerText = "✓ Авторизован";

        // добавляем кнопку перехода
        let btn = document.createElement("button");
        btn.innerText = "Админка";
        btn.onclick = goToAdmin;
        document.getElementById("admin-panel").appendChild(btn);

    } else {
        alert("Неверный пароль.");
    }
}

window.onload = loadCategories;
</script>
