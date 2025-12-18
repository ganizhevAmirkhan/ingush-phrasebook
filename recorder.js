let mediaRecorder;
let recordedChunks = [];

async function startRecording(category, id){
  recordedChunks = [];

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = e => {
    if(e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    await uploadAudio(blob, category, id);
  };

  mediaRecorder.start();
  alert("Запись началась. Нажмите OK чтобы остановить.");
  mediaRecorder.stop();
}

/* ================= UPLOAD ================= */

async function uploadAudio(blob, category, id){
  if(!githubToken) return alert("Нет GitHub Token");

  // ✅ ВАЖНО: сохраняем как .webm
  const fileName = `${id}.webm`;
  const path = `audio/${category}/${fileName}`;

  const base64 = await blobToBase64(blob);

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{
    headers:{ Authorization:`token ${githubToken}` }
  });
  if(check.ok){
    sha = (await check.json()).sha;
  }

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`Add audio ${fileName}`,
      content: base64,
      sha
    })
  });

  alert("Аудио сохранено");

  // 🔁 обновляем индикатор
  checkAudio(category, fileName);
}

/* ================= UTILS ================= */

function blobToBase64(blob){
  return new Promise(resolve=>{
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
