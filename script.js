const categories = [
    "greetings", "basic_phrases", "personal_info", "family", "home",
    "food", "drinks", "travel", "transport", "hunting", "danger",
    "thermal", "navigation", "weather", "emotions", "health", "help",
    "commands", "tools", "animals", "time", "numbers", "colors",
    "money", "shop", "city", "village", "guests", "communication",
    "work", "misc"
];

// ------------------ Загрузка списка категорий ----------------------

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

// ------------------ Загрузка одной категории ----------------------

async function loadCategory(name) {
    const container = document.getElementById("content");
    container.innerHTML = "<p>Загрузка…</p>";

    try {
        // --- ВАЖНО: исправленный путь ---
        const response = await fetch(`categories/${name}.json`);

        if (!response.ok) {
            throw new Error(`Файл не найден: categories/${name}.json`);
        }

        const data = await response.json();

        if (!data.items || !Array.isArray(data.items)) {
            throw new Error("Неверный формат JSON: отсутствует массив items[]");
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

// ------------------ Поиск ----------------------

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
            const resp = await fetch(`categories/${cat}.json`);
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
        } catch (e) {}
    }
}

window.onload = loadCategories;
