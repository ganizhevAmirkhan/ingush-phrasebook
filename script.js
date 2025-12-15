const categories = [
    "greetings","basic_phrases","personal_info","family","home",
    "food","drinks","travel","transport","hunting",
    "danger","thermal","orientation","weather","emotions",
    "health","help","commands","tools","animals",
    "time","numbers","colors","money","shop",
    "city","village","guests","communication","work","misc"
];

window.currentCategory = null;
window.currentData = null;

// ======================
// INIT
// ======================
window.onload = loadCategories;

// ======================
// LOAD CATEGORIES
// ======================
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

// ======================
function convertCategoryName(cat) {
    const map = {
        greetings:"Приветствия",
        basic_phrases:"Основные фразы",
        personal_info:"Личные данные",
        family:"Семья",
        home:"Дом и быт",
        food:"Еда",
        drinks:"Питьё",
        travel:"Путешествия",
        transport:"Транспорт",
        hunting:"Охота",
        danger:"Опасность",
        thermal:"Тепловизор / наблюдение",
        orientation:"Ориентация на местности",
        weather:"Погода",
        emotions:"Эмоции",
        health:"Здоровье",
        help:"Помощь",
        commands:"Команды",
        tools:"Инструменты",
        animals:"Животные",
        time:"Время",
        numbers:"Числа",
        colors:"Цвета",
        money:"Деньги",
        shop:"Магазин",
        city:"Город",
        village:"Село",
        guests:"Гости",
        communication:"Общение",
        work:"Работа",
        misc:"Разное"
    };
    return map[cat] || cat;
}

// ======================
// LOAD CATEGORY
// ======================
async function loadCategory(cat) {
    currentCategory = cat;
    document.getElementById("content-title").textContent =
        convertCategoryName(cat);

    const content = document.getElementById("content");
    content.innerHTML = "Загрузка...";

    const res = await fetch(`categories/${cat}.json`);
    const data = await res.json();

    currentData = data;
    renderPhrases(data);
}

// ======================
// RENDER
// ======================
function renderPhrases(data) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    data.items.forEach((item, i) => {
        const hasLocal = localStorage.getItem(`audio_${currentCategory}_${i}`);
        const hasIcon = hasLocal ? "🟢" : "⚪";

        const div = document.createElement("div");
        div.className = "phrase";
        div.innerHTML = `
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>

            <button onclick="playAudio('${currentCategory}',${i})">🔊</button>
            <span>${hasIcon}</span>

            ${window.adminMode ? `
                <button onclick="startRecording(${i})">🎤</button>
                <button onclick="editPhrase(${i})">✏</button>
                <button onclick="deletePhrase(${i})">🗑</button>
            ` : ""}
        `;
        content.appendChild(div);
    });
}

// ======================
// PLAY AUDIO (fallback)
// ======================
function playAudio(cat, index) {
    const local = localStorage.getItem(`audio_${cat}_${index}`);

    if (local) {
        new Audio(local).play();
        return;
    }

    const url = `audio/${cat}/${index}.webm?v=${Date.now()}`;
    new Audio(url).play().catch(() => {
        alert("Аудио ещё не доступно");
    });
}
