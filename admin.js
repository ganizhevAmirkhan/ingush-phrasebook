// ===============================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ===============================
let adminMode = false;
let currentCategory = null;
let currentData = null;

// ===============================
// ВХОД АДМИНА
// ===============================
function adminLogin() {
    let pass = prompt("Введите пароль администратора:");

    if (pass === "ingush-secret") {
        adminMode = true;
        document.getElementById("admin-status").innerText = "✓ Админ";
        renderPhrases(currentData);
    } else {
        alert("Неверный пароль.");
    }
}

// ===============================
// ВСТАВИТЬ КНОПКИ ДЛЯ РЕДАКТИРОВАНИЯ
// ===============================
function createAdminButtons(item, index) {
    if (!adminMode) return "";

    return `
        <button class="edit-btn" onclick="editPhrase(${index})">✏</button>
        <button class="delete-btn" onclick="deletePhrase(${index})">🗑</button>
        <button class="rec-btn" onclick="startRecording('${index}')">🎤</button>
    `;
}

// ===============================
// РЕДАКТИРОВАНИЕ ФРАЗЫ
// ===============================
function editPhrase(index) {
    let ru = prompt("RU:", currentData.items[index].ru);
    let ing = prompt("ING:", currentData.items[index].ing);
    let pron = prompt("PRON:", currentData.items[index].pron);

    if (!ru || !ing || !pron) return;

    currentData.items[index] = { ru, ing, pron };
    renderPhrases(currentData);
}

// ===============================
// УДАЛЕНИЕ ФРАЗЫ
// ===============================
function deletePhrase(index) {
    if (!confirm("Удалить фразу?")) return;

    currentData.items.splice(index, 1);
    renderPhrases(currentData);
}

// ===============================
// ДОБАВЛЕНИЕ НОВОЙ ФРАЗЫ
// ===============================
function addPhrase() {
    if (!adminMode) return alert("Только для администратора!");

    let ru = prompt("Введите RU фразу:");
    let ing = prompt("Введите ING фразу:");
    let pron = prompt("Введите PRON:");

    if (!ru || !Ing || !pron) return;

    currentData.items.push({ ru, ing, pron });
    renderPhrases(currentData);
}

// ===============================
// СОХРАНЕНИЕ КАТЕГОРИИ В JSON
// ===============================
function saveCategory() {
    if (!adminMode) return;

    const blob = new Blob([JSON.stringify(currentData, null, 4)], {
        type: "application/json",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentCategory}.json`;
    a.click();
}

// ===============================
// ОЗВУЧКА (ВОСПРОИЗВЕДЕНИЕ MP3)
// ===============================
function playAudio(category, index) {
    const audio = new Audio(`audio/${category}/${index}.mp3`);
    audio.play().catch(() => alert("Аудио отсутствует"));
}

// ===============================
// ЗАПИСЬ АУДИО ДЛЯ ФРАЗЫ
// ===============================
let mediaRecorder;
let recordedChunks = [];

async function startRecording(index) {
    if (!adminMode) return alert("Только админ!");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);

    recordedChunks = [];
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);

    mediaRecorder.onstop = () => saveAudio(index);

    mediaRecorder.start();
    alert("Запись началась. Нажмите OK чтобы завершить запись.");

    setTimeout(() => {
        mediaRecorder.stop();
    }, 3000); // 3 сек запись
}

function saveAudio(index) {
    const blob = new Blob(recordedChunks, { type: "audio/mp3" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${index}.mp3`;
    a.click();

    alert("Аудиофайл сохранён! Теперь загрузите его в GitHub: audio/категория/");
}

// ===============================
// ЭКСПОРТ ВСЕГО РАЗГОВОРНИКА В ZIP
// ===============================
async function exportZip() {
    const zip = new JSZip();

    for (let cat of categories) {
        const res = await fetch(`categories/${cat}.json`);
        const json = await res.json();

        zip.file(`${cat}.json`, JSON.stringify(json, null, 4));
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "phrasebook.zip";
    a.click();
}

// ===============================
// ГЛАВНАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ
// ===============================
function renderPhrases(data) {
    const content = document.getElementById("content");
    content.innerHTML = "";

    currentData = data;

    data.items.forEach((item, i) => {
        const div = document.createElement("div");
        div.className = "phrase";

        div.innerHTML = `
            <p><b>RU:</b> ${item.ru}</p>
            <p><b>ING:</b> ${item.ing}</p>
            <p><b>PRON:</b> ${item.pron}</p>

            <button class="audio-btn" onclick="playAudio('${currentCategory}', ${i})">🔊</button>

            ${createAdminButtons(item, i)}
        `;

        content.appendChild(div);
    });

    if (adminMode) {
        const btn = document.createElement("button");
        btn.innerText = "➕ Добавить фразу";
        btn.onclick = addPhrase;
        btn.style = "margin-top:20px; padding:10px;";
        content.appendChild(btn);

        const save = document.createElement("button");
        save.innerText = "💾 Сохранить категорию";
        save.onclick = saveCategory;
        save.style = "margin-left:15px; padding:10px;";
        content.appendChild(save);
    }
}
