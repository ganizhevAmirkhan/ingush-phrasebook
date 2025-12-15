// ==================================================
// RECORDER.JS — ФИНАЛЬНЫЙ
// ==================================================

let mediaRecorder = null;
let audioChunks = [];
let recordTimer = null;
let recordDuration = 3000; // по умолчанию 3 сек

// ==================================================
// ЗАПУСК ЗАПИСИ
// ==================================================
async function startRecording(category, index) {
  if (!adminMode) {
    alert("Только администратор может записывать аудио");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 48000 // 📦 оптимизация размера
    });

    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      saveRecordedAudio(category, index);
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();

    // ⏹ автостоп
    recordTimer = setTimeout(() => stopRecording(), recordDuration);

    alert(`🎙 Запись началась (${recordDuration / 1000} сек)`);

  } catch (e) {
    alert("❌ Нет доступа к микрофону");
    console.error(e);
  }
}

// ==================================================
// ОСТАНОВКА
// ==================================================
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    clearTimeout(recordTimer);
    mediaRecorder.stop();
  }
}

// ==================================================
// СОХРАНЕНИЕ (локально + fallback)
// ==================================================
function saveRecordedAudio(category, index) {
  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const url = URL.createObjectURL(blob);

  // 🧠 ЛОКАЛЬНЫЙ FALLBACK
  localStorage.setItem(`audio_${category}_${index}`, url);

  // 🟢 обновляем индикатор
  const status = document.getElementById(`audio-status-${index}`);
  if (status) status.textContent = "🟢";

  // 🔊 мгновенно можно слушать
  window.lastRecordedAudio = url;

  alert("✔ Аудио записано (локально)");
}

// ==================================================
// ВОСПРОИЗВЕДЕНИЕ С FALLBACK
// ==================================================
function playAudio(src) {
  const audio = new Audio();

  audio.onerror = () => {
    // 🧠 если GitHub Pages не обновился
    const key = `audio_${currentCategory}_${src.split("/").pop().replace(".webm","")}`;
    const local = localStorage.getItem(key);
    if (local) {
      audio.src = local;
      audio.play();
    } else {
      alert("Аудио не найдено");
    }
  };

  audio.src = src;
  audio.play();
}

// ==================================================
// ВЫБОР ДЛИТЕЛЬНОСТИ (опционально)
// ==================================================
function setRecordDuration(ms) {
  recordDuration = ms;
}
