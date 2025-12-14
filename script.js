// -------------------------------
// Настройки
// -------------------------------
const CATEGORY_PATH = "categories/";
const ADMIN_PASSWORD = "ingush-secret";

let isAdmin = false;
let phrases = [];


// -------------------------------
// Список файлов категорий (БЕЗ цифр)
// -------------------------------
const categoryFiles = [
    "greetings.json",
    "basic_phrases.json",
    "personal_info.json",
    "family.json",
    "home.json",
    "food.json",
    "drinks.json",
    "travel.json",
    "transport.json",
    "hunting.json",
    "danger.json",
    "thermal.json",
    "navigation.json",
    "weather.json",
    "emotions.json",
    "health.json",
    "help.json",
    "commands.json",
    "tools.json",
    "animals.json",
    "time.json",
    "numbers.json",
    "colors.json",
    "money.json",
    "shop.json",
    "city.json",
    "village.json",
    "guests.json",
    "communication.json",
    "work.json",
    "misc.json"
];


// -------------------------------
// Создание списка категорий
// -------------------------------
function loadCategories() {
    const list = document.getElementById("category-list");
    list.innerHTML = "";

    categoryFiles.forEach(file => {
        const name = file.replace(".json", "").replace("_", " ");

        const btn = document.createElement("button");
        btn.className = "category-btn";
        btn.textContent = name;
        btn.onclick = () => loadCategory(file);

        list.appendChild(btn);
    });
}


// -------------------------------
// Загрузка фраз категории
// -------------------------------
async function loadCategory(file) {
    try {
        const res = await fetch(CATEGORY_PATH + file);
        if (!res.ok) throw new Error("Файл не найден: " + file);

        const data = await res.json();
        phrases = data;

        renderPhrases(data);
    } catch (err) {
        console.error(err);
        alert("Ошибка загрузки: " + file);
    }
}


// -------------------------------
// Показ фраз
// -------------------------------
function renderPhrases(list) {
    const box = document.getElementById("content");
    box.innerHTML = "";

    list.forEach((ph, index) => {
        const div = document.createElement("div");
        div.className = "phrase-card";

        div.innerHTML = `
            <div class="ru"><b>${ph.ru}</b></div>
            <div class="ing">${ph.ing}</div>

            <div class="tools">
                <button onclick="playAudio('${ph.ing}')">🔊</button>
                ${isAdmin ? `<button onclick="editPhrase(${index})">✏️</button>` : ""}
            </div>
        `;

        box.appendChild(div);
    });
}


// -------------------------------
// Поиск по всем категориям
// -------------------------------
async function globalSearch() {
    const q = document.getElementById("search").value.trim().toLowerCase();
    if (!q) return;

    const box = document.getElementById("content");
    box.innerHTML = "<h3>Результаты поиска...</h3>";

    let results = [];

    for (let file of categoryFiles) {
        try {
            const res = await fetch(CATEGORY_PATH + file);
            const data = await res.json();

            results.push(
                ...data.filter(p =>
                    p.ru.toLowerCase().includes(q) ||
                    p.ing.toLowerCase().includes(q)
                )
            );
        } catch (e) {
            console.warn("Не удалось загрузить: " + file);
        }
    }

    renderPhrases(results);
}


// -------------------------------
// Проигрывание аудио
// -------------------------------
function playAudio(word) {
    const audio = new Audio(`audio/${word}.mp3`);
    audio.play().catch(() => alert("Нет аудио для: " + word));
}


// -------------------------------
// Вход администратора
// -------------------------------
function adminLogin() {
    const pass = prompt("Введите пароль:");
    if (pass === ADMIN_PASSWORD) {
        isAdmin = true;
        document.getElementById("admin-status").textContent = "✓ Администратор";
        alert("Админ-режим включён");
    } else {
        alert("Неверный пароль");
    }
}


// -------------------------------
// Запуск
// -------------------------------
window.onload = () => {
    loadCategories();
};
