let mediaRecorder = null;
let audioChunks = [];

// ================================
// НАЧАТЬ ЗАПИСЬ
// ================================
async function startRecording(index) {
    if (!window.adminMode) {
        alert("Только администратор");
        return;
    }

    if (!window.githubToken) {
        alert("Введите GitHub Token");
        return;
    }

    if (!window.currentCategory) {
        alert("Категория не выбрана");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm"
        });

        mediaRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => uploadAudio(index);

        mediaRecorder.start();
        alert("🎙 Запись началась (3 секунды)");

        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
        }, 3000);

    } catch (e) {
        console.error(e);
        alert("Ошибка доступа к микрофону");
    }
}

// ================================
// ЗАГРУЗКА АУДИО В GITHUB
// ================================
async function uploadAudio(index) {
    if (!audioChunks.length) {
        alert("Аудио не записалось");
        return;
    }

    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const base64 = await blobToBase64(blob);

    // 🔥 НАДЁЖНОЕ ИМЯ ФАЙЛА
    const filename = `${index}.webm`;
    const path = `audio/${window.currentCategory}/${filename}`;

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    let sha = null;

    // 1️⃣ Проверяем, есть ли файл
    const check = await fetch(url, {
        headers: {
            "Authorization": `token ${window.githubToken}`
        }
    });

    if (check.ok) {
        const json = await check.json();
        sha = json.sha;
    }

    // 2️⃣ Загружаем / перезаписываем
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${window.githubToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: `Add audio: ${window.currentCategory}/${filename}`,
            content: base64.split(",")[1],
            sha: sha || undefined,
            branch: GITHUB_BRANCH
        })
    });

    if (res.ok) {
        alert("✅ Аудио сохранено в GitHub");
    } else {
        const err = await res.json();
        console.error(err);
        alert("❌ Ошибка загрузки аудио: " + (err.message || "unknown"));
    }
}

// ================================
// BLOB → BASE64
// ================================
function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}
