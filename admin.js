// =========================
// admin.js — админ-панель разговорника
// =========================

let adminDataCache = {};  // Все категории, загруженные в память
let adminIsLoaded = false;

// =========================
// Загрузка всех категорий в память
// =========================

async function adminLoadAllCategories() {
    if (adminIsLoaded) return;

    for (const cat of Object.keys(CATEGORY_TITLES)) {
        try {
            const res = await fetch(`categories/${cat}.json`);
            if (!res.ok) continue;

            const data = await res.json();
            adminDataCache[cat] = data.items ?? data;

        } catch (e) {
            console.warn("Не удалось загрузить", cat, e);
        }
    }

    adminIsLoaded = true;
    console.log("Категории загружены", adminDataCache);
}

// =========================
// Добавление фразы
// =========================

async function adminAddPhrase() {
    if (!adminMode) {
        alert("Нет доступа: войдите как админ");
        return;
    }

    await adminLoadAllCategories();

    const cat = document.getElementById("admin-category").value;
    const ru = document.getElementById("admin-ru").value.trim();
    const ing = document.getElementById("admin-ing").value.trim();
    const pron = document.getElementById("admin-pron").value.trim();

    if (!ru || !ing) {
        alert("RU и ING обязательны!");
        return;
    }

    const newPhrase = { ru, ing, pron };

    adminDataCache[cat].push(newPhrase);

    alert("Фраза добавлена!");

    document.getElementById("admin-ru").value = "";
    document.getElementById("admin-ing").value = "";
    document.getElementById("admin-pron").value = "";

    // Если сейчас открыта эта категория — обновляем отображение
    loadCategory(cat);
}

// =========================
// Генерация ZIP для скачивания
// =========================

async function adminDownloadAll() {
    if (!adminMode) {
        alert("Нет доступа");
        return;
    }

    await adminLoadAllCategories();

    const zip = new JSZip();

    for (const cat of Object.keys(adminDataCache)) {
        const json = {
            category: cat,
            items: adminDataCache[cat]
        };

        zip.file(`categories/${cat}.json`, JSON.stringify(json, null, 2));
    }

    const blob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ingush_phrasebook.zip";
    a.click();

    alert("ZIP архив готов!");
}

// =========================
// Озвучка текста (ингушский)
// =========================

async function adminTextToSpeech(text) {
    const token = prompt("Введите API-токен озвучки:");

    if (!token) {
        alert("Токен обязателен");
        return;
    }

    try {
        const res = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini-tts",
                voice: "alloy",
                input: text
            })
        });

        if (!res.ok) throw new Error("Ошибка API");

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        audio.play();

    } catch (e) {
        alert("Ошибка озвучки: " + e.message);
    }
}

// =========================
// Автоматическое подключение
// =========================

console.log("admin.js подключен");
