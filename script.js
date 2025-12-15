// ===============================
// КАТЕГОРИИ (русские названия)
// ===============================

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
    shop: "В магазине",
    city: "В городе",
    village: "В селе",
    guests: "Приём гостей",
    communication: "Общение",
    work: "Работа",
    misc: "Разное"
};

const categories = Object.keys(categoryNames);
let currentCategory = null;
let currentData = null;
let adminMode = false;

// ===============================
// ЗАГРУЗКА КАТЕГОРИЙ
// ===============================

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

async function loadCategory(cat) {
    currentCategory = cat;
    document.getElementById("content-title").innerText = categoryNames[cat];

    try {
        const res = await fetch(`categories/${cat}.json`);
        if (!res.ok) throw new Error("Файл не найден");

        const json = await res.json();
        currentData = json.items || json;

        renderPhrases(currentData);
    } catch (e) {
        document.getElementById("content").innerHTML =
            `<p style="color:red;">Ошибка: ${e.message}</p>`;
    }
}

// ===============================
// ВЫВОД ФРАЗ
// ===============================

function renderPhrases(items) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    items.forEach((item, index) => {
        const block = document.createElement("div");
        block.className = "phrase";

        const audioFile = `audio/${currentCategory}/${item.pron}.mp3`;

        block.innerHTML = `
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}
                <button class="audio-btn" onclick="playAudio('${audioFile}')">🔊</button>
                <button class="rec-btn" onclick="startRecording('${item.pron}')">🎤</button>
            </p>
        `;

        if (adminMode) {
            block.innerHTML += `
                <button class="edit-btn" onclick="editPhrase(${index})">✏</button>
                <button class="delete-btn" onclick="deletePhrase(${index})">❌</button>
            `;
        }

        content.appendChild(block);
    });
}

function playAudio(url) {
    let audio = new Audio(url);
    audio.play();
}

// ===============================
// ПОИСК
// ===============================

async function searchPhrases() {
    const q = document.getElementById("search-bar").value.toLowerCase();
    if (q.length < 2) return;

    let results = [];

    for (const cat of categories) {
        const res = await fetch(`categories/${cat}.json`);
        if (!res.ok) continue;

        const json = await res.json();
        const items = json.items || json;

        items.forEach(item => {
            if (item.ru.toLowerCase().includes(q) || item.ing.toLowerCase().includes(q)) {
                results.push({ ...item, cat });
            }
        });
    }

    renderSearchResults(results);
}

function renderSearchResults(list) {
    const content = document.getElementById("content");
    document.getElementById("content-title").innerText = "Результаты поиска";
    content.innerHTML = "";

    list.forEach(item => {
        const audioFile = `audio/${item.cat}/${item.pron}.mp3`;

        const block = document.createElement("div");
        block.className = "phrase";

        block.innerHTML = `
            <p><b>${categoryNames[item.cat]}</b></p>
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}
                <button onclick="playAudio('${audioFile}')">🔊</button>
            </p>
        `;

        content.appendChild(block);
    });
}

window.onload = loadCategories;
