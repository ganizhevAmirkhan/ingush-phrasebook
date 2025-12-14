// ============================
// Настройка категорий
// ============================

const categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting", "danger",
    "thermal", "navigation", "weather", "emotions", "health", "help",
    "commands", "tools", "animals", "time", "numbers", "colors",
    "money", "shop", "city", "village", "guests", "communication",
    "work", "misc"
];


// ============================
// Загрузка списка категорий
// ============================

function loadCategories() {
    const list = document.getElementById("categoryList");
    list.innerHTML = "";

    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-item";
        btn.textContent = formatCategoryName(cat);
        btn.onclick = () => loadCategory(cat);
        list.appendChild(btn);
    });
}


// Человеческое отображение названия категории
function formatCategoryName(name) {
    return name.replace(/_/g, " ");
}


// ============================
// Загрузка категории
// ============================

async function loadCategory(name) {
    const container = document.getElementById("content");
    container.innerHTML = "<p>Загрузка…</p>";

    try {
        // ВАЖНО!!! теперь путь правильный:
        const response = await fetch(`categories/${name}.json`);

        if (!response.ok) {
            throw new Error("Файл не найден");
        }

        const data = await response.json();

        if (!data.items || !Array.isArray(data.items)) {
            throw new Error("Некорректный формат JSON: ожидается items[]");
        }

        container.innerHTML = `<h2>${formatCategoryName(name)}</h2>`;

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


// ============================
// Глобальный поиск
// ============================

async function searchPhrases() {
    const query = document.getElementById("search").value.trim().toLowerCase();
    const container = document.getElementById("content");

    if (query.length < 2) {
        container.innerHTML = "<p>Введите минимум 2 символа…</p>";
        return;
    }

    container.innerHTML = "<h2>Результаты поиска</h2>";

    for (let cat of categories) {
        try {
            const response = await fetch(`categories/${cat}.json`);
            if (!response.ok) continue;

            const data = await response.json();
            if (!data.items) continue;

            data.items.forEach(item => {
                if (
                    item.ru.toLowerCase().includes(query) ||
                    item.ing.toLowerCase().includes(query)
                ) {
                    const block = document.createElement("div");
                    block.className = "phrase-block";

                    block.innerHTML = `
                        <h4>${formatCategoryName(cat)}</h4>
                        <p><b>RU:</b> ${item.ru}</p>
                        <p><b>ING:</b> ${item.ing}</p>
                        <p><b>PRON:</b> ${item.pron}</p>
                    `;

                    container.appendChild(block);
                }
            });

        } catch (e) {}
    }
}


// ============================
// Старт
// ============================

window.onload = loadCategories;
