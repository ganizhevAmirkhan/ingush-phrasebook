let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// ==================================================
// 1. Запуск записи
// ==================================================

async function startRecording(category, index) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => saveAudio(category, index);

        mediaRecorder.start();
        isRecording = true;

        alert("🎙 Запись началась...");

    } catch (e) {
        alert("Ошибка: не удалось получить доступ к микрофону");
        console.error(e);
    }
}

// ==================================================
// 2. Остановка записи
// ==================================================

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        alert("🎤 Запись остановлена. Файл сохраняется...");
    }
}

// ==================================================
// 3. Сохранение аудио (MP3) в GitHub
// ==================================================

async function saveAudio(category, index) {
    const blob = new Blob(audioChunks, { type: "audio/mp3" });
    const reader = new FileReader();

    reader.onloadend = async () => {
        const base64Audio = reader.result.split(",")[1];

        const filename = `${index}.mp3`;
        const path = `audio/${category}/${filename}`;

        console.log("📁 Загружаем файл:", path);

        await uploadFileToGitHub(path, base64Audio);

        alert("✔ Аудио сохранено!");

        // Обновляем кнопку
        const audio = document.getElementById(`audio_${category}_${index}`);
        if (audio) audio.src = path;
    };

    reader.readAsDataURL(blob);
}

// ==================================================
// 4. Воспроизведение аудио
// ==================================================

function playAudio(category, index) {
    const audio = document.getElementById(`audio_${category}_${index}`);

    if (!audio) {
        alert("Аудиофайл отсутствует!");
        return;
    }

    audio.play().catch(() => {
        alert("Ошибка: файл не найден или не загружен.");
    });
}

