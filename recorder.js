let mediaRecorder;
let chunks = [];

async function startRecording(category, id) {
  if (!githubToken) {
    alert("Нет GitHub Token");
    return;
  }

  chunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    await uploadAudio(blob, category, id);
  };

  mediaRecorder.start();
  alert("Идёт запись. Нажмите OK для остановки.");
  mediaRecorder.stop();
}

async function uploadAudio(blob, category, id) {
  const fileName = `${id}.webm`;
  const path = `audio/${category}/${fileName}`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const base64 = await blobToBase64(blob);

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${githubToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Add audio ${fileName}`,
      content: base64
    })
  });

  checkAudio(category, { id, audio: fileName });
}

function blobToBase64(blob) {
  return new Promise(res => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(",")[1]);
    r.readAsDataURL(blob);
  });
}
