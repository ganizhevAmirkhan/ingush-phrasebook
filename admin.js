// ===============================
//   ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ===============================

let currentCategory = null;
let categoryData = null;
let adminToken = null;

let recorder;
let audioChunks = [];
let isRecording = false;

const githubOwner = "ganizhevAmirkhan";
const githubRepo = "ingush-phrasebook";
const githubBranch = "main";


// ===============================
//   ЗАГРУЗКА КАТЕГОРИЙ
// ===============================

async function loadCategories() {
    const list = document.getElementById("categories-list");
    list.innerHTML = "";

    try {
        const res = await fetch("../categories.json");
        const cats = await res.json();

        cats.forEach(cat => {
            const div = document.createElement("div");
            div.className = "category-item";
            div.innerText = cat.title;
            div.onclick = () => loadCategory(cat.file);
            list.appendChild(div);
        });

    } catch (e) {
        alert("Ошибка загрузки списка категорий: " + e.message);
    }
}


// ===============================
//   ЗАГРУЗКА ОДНОЙ КАТЕГОРИИ
// ===============================

async function loadCategory(filename) {
    currentCategory = filename;

    const title = document.getElementById("category-title");
    const container = document.getElementById("phrases-container");

    container.innerHTML = "Загрузка…";

    try {
        const res = await fetch(`../dialogues/${filename}`);
        categoryData = await res.json();

        title.innerText = categoryData.category_ru || filename;
        renderPhrases();

    } catch (e) {
        container.innerHTML = `<p class="error">Не удалось загрузить категорию: ${e.message}</p>`;
    }
}


// ===============================
//   ОТОБРАЖЕНИЕ ФРАЗ
// ===============================

function renderPhrases() {
    const container = document.getElementById("phrases-container");
    container.innerHTML = "";

    categoryData.items.forEach((item, index) => {
        const block = document.createElement("div");
        block.className = "phrase-item";

        block.innerHTML = `
            <div><b>RU:</b> ${item.ru}</div>
            <div><b>ING:</b> ${item.ing}</div>
            <div><b>PRON:</b> ${item.pron}</div>

            <audio id="audio-${index}" controls src="../audio/${item.ing}.mp3"></audio>

            <button onclick="editPhrase(${index})">✏ Редактировать</button>
            <button onclick="confirmDelete(${index})" class="delete-btn">🗑 Удалить</button>
            <button onclick="startRecording(${index})">🎤 Записать MP3</button>
        `;

        container.appendChild(block);
    });
}


// ===============================
//   РЕДАКТИРОВАНИЕ ФРАЗ
// ===============================

function editPhrase(index) {
    const item = categoryData.items[index];

    document.getElementById("edit-ru").value = item.ru;
    document.getElementById("edit-ing").value = item.ing;
    document.getElementById("edit-pron").value = item.pron;

    document.getElementById("edit-index").value = index;

    openModal("edit-modal");
}

function saveEdit() {
    const index = document.getElementById("edit-index").value;

    categoryData.items[index] = {
        ru: document.getElementById("edit-ru").value,
        ing: document.getElementById("edit-ing").value,
        pron: document.getElementById("edit-pron").value
    };

    closeModal("edit-modal");
    renderPhrases();
    showSuccess();
}


// ===============================
//   ДОБАВЛЕНИЕ НОВОЙ ФРАЗЫ
// ===============================

function addPhrase() {
    const ru = document.getElementById("new-ru").value.trim();
    const ing = document.getElementById("new-ing").value.trim();
    const pron = document.getElementById("new-pron").value.trim();

    if (!ru || !ing) return alert("Заполните хотя бы RU и ING!");

    categoryData.items.push({ ru, ing, pron });

    renderPhrases();
    showSuccess();
}


// ===============================
//   УДАЛЕНИЕ ФРАЗЫ
// ===============================

function confirmDelete(index) {
    const item = categoryData.items[index];

    document.getElementById("delete-text").innerText =
        `${item.ru} → ${item.ing}`;

    document.getElementById("delete-index").value = index;

    openModal("delete-confirm");
}

function deletePhrase() {
    const index = document.getElementById("delete-index").value;
    categoryData.items.splice(index, 1);

    closeModal("delete-confirm");
    renderPhrases();
    showSuccess();
}


// ===============================
//   ЗАПИСЬ АУДИО (WAV → MP3)
// ===============================

async function startRecording(index) {
    if (!navigator.mediaDevices) {
        alert("Браузер не поддерживает запись звука.");
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioChunks = [];
    recorder = new MediaRecorder(stream);

    recorder.ondataavailable = e => audioChunks.push(e.data);

    recorder.onstop = () => saveAudio(index);

    recorder.start();
    isRecording = true;

    alert("🎤 Запись началась. Нажмите ОК чтобы остановить.");
    recorder.stop();
}

async function saveAudio(index) {
    const wavBlob = new Blob(audioChunks, { type: "audio/wav" });

    const arrayBuffer = await wavBlob.arrayBuffer();
    const wavData = new Uint8Array(arrayBuffer);

    const mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    const samples = new Int16Array(wavData.buffer);

    const mp3Data = [];
    let mp3buf = mp3encoder.encodeBuffer(samples);
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    const mp3Blob = new Blob(mp3Data, { type: "audio/mp3" });

    await uploadMP3(index, mp3Blob);
}


// ===============================
//   ЗАГРУЗКА MP3 В GITHUB
// ===============================

async function uploadMP3(index, blob) {
    if (!adminToken) {
        adminToken = prompt("Введите GitHub Token:");
    }

    const filename = categoryData.items[index].ing + ".mp3";

    const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/audio/${filename}`;

    const base64 = await blobToBase64(blob);

    const body = {
        message: `Upload audio for ${filename}`,
        content: base64,
        branch: githubBranch
    };

    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${adminToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        showSuccess();
        renderPhrases();
    } else {
        showError();
    }
}

function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () =>
            resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
    });
}


// ===============================
//   СОХРАНЕНИЕ JSON КАТЕГОРИИ В GITHUB
// ===============================

async function saveCategoryToGitHub() {
    if (!adminToken) {
        adminToken = prompt("Введите GitHub Token:");
    }

    const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/dialogues/${currentCategory}`;

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(categoryData, null, 2))));

    const body = {
        message: `Update ${currentCategory}`,
        content,
        branch: githubBranch
    };

    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${adminToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        showSuccess();
    } else {
        showError();
    }
}


// ===============================
//   МОДАЛЬНЫЕ ОКНА
// ===============================

function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
    document.getElementById("overlay").classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
    document.getElementById("overlay").classList.add("hidden");
}


// ===============================
//   POPUP УВЕДОМЛЕНИЯ
// ===============================

function showSuccess() {
    const el = document.getElementById("success-popup");
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 1800);
}

function showError() {
    const el = document.getElementById("error-popup");
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 2200);
}


// ===============================

window.onload = loadCategories;

