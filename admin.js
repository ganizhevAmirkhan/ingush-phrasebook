//
// ===============================
//     АДМИН МОДУЛЬ РАЗГОВОРНИКА
// ===============================
//

let GITHUB_TOKEN = "";
let GITHUB_OWNER = "ganizhevAmirkhan";
let GITHUB_REPO = "ingush-phrasebook";
let GITHUB_BRANCH = "main";

let adminMode = false;

// ===============================
//   ВХОД В АДМИН-МОД
// ===============================

function adminLogin() {
    const pass = prompt("Введите пароль администратора:");

    if (pass === "ingush-secret") {
        adminMode = true;
        document.getElementById("admin-status").innerText = "✓ Админ";
        alert("Админ режим активирован!");

        GITHUB_TOKEN = prompt("Введите GitHub token (для загрузки MP3):\nЕсли нет — оставьте пустым.");

        renderPhrases(currentData);
    } else {
        alert("Неверный пароль");
    }
}

// ===============================
//   КНОПКА: ДОБАВИТЬ ФРАЗУ
// ===============================

function addPhrase() {
    if (!adminMode) return alert("Требуется вход администратора");

    const ru = prompt("Новая фраза (RU):");
    const ing = prompt("Перевод (ING):");
    const pron = prompt("Произношение (латиница):");

    if (!ru || !ing || !pron) return alert("Заполните все поля");

    currentData.push({ ru, ing, pron });
    renderPhrases(currentData);
    saveCategory();
}

// ===============================
//   РЕДАКТИРОВАНИЕ ФРАЗЫ
// ===============================

function editPhrase(index) {
    if (!adminMode) return;

    const item = currentData[index];

    const ru = prompt("RU:", item.ru);
    const ing = prompt("ING:", item.ing);
    const pron = prompt("PRON:", item.pron);

    if (!ru || !ing || !pron) return;

    currentData[index] = { ru, ing, pron };
    renderPhrases(currentData);
    saveCategory();
}

// ===============================
//   УДАЛЕНИЕ ФРАЗЫ
// ===============================

function deletePhrase(index) {
    if (!adminMode) return;

    if (!confirm("Удалить фразу?")) return;

    currentData.splice(index, 1);
    renderPhrases(currentData);
    saveCategory();
}

// ===============================
//   СОХРАНЕНИЕ КАТЕГОРИИ
// ===============================

async function saveCategory() {
    if (!adminMode) return;

    const filePath = `categories/${currentCategory}.json`;

    const body = {
        message: `update ${currentCategory}.json`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ items: currentData }, null, 2)))),
        branch: GITHUB_BRANCH
    };

    // Получение SHA файла
    const shaReq = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`);
    const shaData = await shaReq.json();

    if (shaData.sha) body.sha = shaData.sha;

    const upload = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${GITHUB_TOKEN}`
        },
        body: JSON.stringify(body)
    });

    if (upload.ok) {
        alert("Категория сохранена!");
    } else {
        alert("Ошибка сохранения (проверь токен!)");
    }
}

// ===============================
//   СОХРАНИТЬ РАЗГОВОРНИК ZIP
// ===============================

async function exportZip() {
    const zip = new JSZip();

    for (const cat of categories) {
        const res = await fetch(`categories/${cat}.json`);
        if (!res.ok) continue;

        const json = await res.json();
        zip.folder("categories").file(`${cat}.json`, JSON.stringify(json, null, 2));
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "ingush_phrasebook.zip");
}

// ===============================
//   ИМПОРТ ZIP РАЗГОВОРНИКА
// ===============================

async function importZip(file) {
    const zip = await JSZip.loadAsync(file);

    for (const filename of Object.keys(zip.files)) {
        if (!filename.endsWith(".json")) continue;

        const jsonText = await zip.files[filename].async("string");

        const filePath = filename;
        const body = {
            message: `import ${filePath}`,
            content: btoa(unescape(encodeURIComponent(jsonText))),
            branch: GITHUB_BRANCH
        };

        // SHA
        const shaReq = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`);
        const shaData = await shaReq.json();
        if (shaData.sha) body.sha = shaData.sha;

        await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `token ${GITHUB_TOKEN}`
            },
            body: JSON.stringify(body)
        });
    }

    alert("Разговорник импортирован!");
}

// ===============================
//   ЗАГРУЗКА MP3 НА GITHUB
// ===============================

async function uploadMP3(filename, blob, category) {
    if (!GITHUB_TOKEN) {
        alert("Токен GitHub не указан");
        return;
    }

    const path = `audio/${category}/${filename}`;

    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const body = {
        message: `upload audio ${filename}`,
        content: base64,
        branch: GITHUB_BRANCH
    };

    // SHA — если файл существует
    const shaReq = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`);
    const shaData = await shaReq.json();
    if (shaData.sha) body.sha = shaData.sha;

    const upload = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${GITHUB_TOKEN}`
        },
        body: JSON.stringify(body)
    });

    if (upload.ok) {
        alert("Аудио загружено!");
    } else {
        alert("Ошибка загрузки аудио!");
    }
}
