console.log("SCRIPT VERSION 3 LOADED");

// =======================
// СПИСОК КАТЕГОРИЙ
// =======================

const categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting", "danger",
    "thermal", "navigation", "weather", "emotions", "health", "help",
    "commands", "tools", "animals", "time", "numbers", "colors",
    "money", "shop", "city", "village", "guests", "communication",
    "work", "misc"
];

// =======================
// ЗАГРУЗКА СПИСКА КАТЕГОРИЙ
// =======================

function loadCategories() {
    const list = document.getElementById("categoryList");
    list.innerHTML = "";

    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-item";
        btn.textContent = cat.replace("_", " ");
        btn.onclick = () => loadCategory(cat);
        list.appendChild(btn);
    });
}

// =======================
// ЗАГРУЗКА ОДНОЙ КАТЕГОРИИ
// =======================

async function loadCategory(name) {
    const container = document.getElementById("content");
    container.innerHTML = "<p>Загрузка…</p>";

    try {
        // --- Защита от кэширования GitHub Pages ---
        const url = `dialogues/${name}.json?v=${Date.now()}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Файл не найден");

        const data = await response.json();

        // Проверка структуры JSON
        if (!data.items || !Array.isArray(data.items)) {
            throw new Error("Неверный формат JSON: нет items[]");
        }

        container.innerHTML = `<h2>${name.replace("_", " ")}</h2>`;

        data.items.forEach(item => {
            const block = document.createElement("div");
            block.className = "phrase-block";

            block.innerHTML = `
                <p><b>RU:</b> ${item.ru}</p>
                <p><b>ING:</b> ${item.ing}</p>
                <p><b>PRON:</b> ${item.pron}</p>
            `;

            container.appendChild(block);
        });

    } catch (err) {
        container.innerHTML = `<p style="color:red;">Ошибка загрузки: ${err.message}</p>`;
    }
}

// =======================
// ГЛОБАЛЬНЫЙ ПОИСК
// =======================

async function searchPhrases() {
    const q = document.getElementById("search").value.trim().toLowerCase();
    const container = document.getElementById("content");

    if (q.length < 2) {
        container.innerHTML = "<p>Введите минимум 2 символа…</p>";
        return;
    }

    container.innerHTML = "<h2>Результаты поиска</h2>";

    for (let cat of categories) {
        try {
            const url = `dialogues/${cat}.json?v=${Date.now()}`;
            const resp = await fetch(url);
            if (!resp.ok) continue;

            const data = await resp.json();
            if (!data.items) continue;

            data.items.forEach(item => {
                if (
                    item.ru.toLowerCase().includes(q) ||
                    item.ing.toLowerCase().includes(q)
                ) {
                    const block = document.createElement("div");
                    block.className = "phrase-block";

                    block.innerHTML = `
                        <h4>${cat.replace("_", " ")}</h4>
                        <p><b>RU:</b> ${item.ru}</p>
                        <p><b>ING:</b> ${item.ing}</p>
                        <p><b>PRON:</b> ${item.pron}</p>
                    `;

                    container.appendChild(block);
                }
            });
        } catch (e) {
            console.warn("Ошибка поиска в категории:", cat);
        }
    }
}

window.onload = loadCategories;
