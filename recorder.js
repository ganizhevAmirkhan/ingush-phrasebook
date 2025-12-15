let recorder;
let chunks = [];

async function startRecording(index) {
  if (!window.adminMode) return alert("Только админ");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  chunks = [];

  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => uploadAudio(index);

  recorder.start();
  alert("Запись началась (3 сек)");

  setTimeout(() => recorder.stop(), 3000);
}

async function uploadAudio(index) {
  const blob = new Blob(chunks, { type: "audio/webm" });
  const base64 = await blobToBase64(blob);

  const latin = translit(window.currentData.items[index].ing);
  const path = `audio/${window.currentCategory}/${latin}.webm`;

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `token ${window.githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Add audio",
        content: base64.split(",")[1],
        branch: GITHUB_BRANCH
      })
    }
  );

  if (res.ok) alert("Аудио сохранено в GitHub");
  else alert("Ошибка загрузки аудио");
}

// ===== ВСПОМОГАТЕЛЬНЫЕ =====
function blobToBase64(blob) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
}

function translit(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
