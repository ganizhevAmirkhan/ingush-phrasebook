let mediaRecorder;
let audioChunks = [];
let recordCategory = null;
let recordPron = null;

function normalizePron(pron) {
  return pron
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

async function startRecording(category, pron) {
  recordCategory = category;
  recordPron = normalizePron(pron);

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm"
  });

  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });

    // ▶ локальное проигрывание (fallback)
    const audio = new Audio(URL.createObjectURL(blob));
    audio.play();

    // ☁ загрузка в GitHub
    const token = localStorage.getItem("gh_token");
    if (!token) {
      alert("Нет GitHub Token");
      return;
    }

    const path = `audio/${recordCategory}/${recordPron}.webm`;
    await uploadAudioToGitHub(path, blob, token);

    alert("Аудио сохранено в GitHub");
  };

  mediaRecorder.start();
  setTimeout(() => mediaRecorder.stop(), 3000); // ⏱ 3 сек (можно менять)
}
