let mediaRecorder;
let audioChunks = [];

async function startRecording(category, item){
  if(!githubToken) return alert("Нет GitHub Token");

  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());

    const wavBlob = new Blob(audioChunks, { type: "audio/wav" });

    // ⚠️ имя файла ТОЛЬКО по id
    const fileName = item.id + ".mp3";

    await uploadAudioMP3(category, fileName, wavBlob);

    if(typeof refreshAfterChange === "function"){
      await refreshAfterChange();
    }
  };

  mediaRecorder.start();

  // 4 секунды
  setTimeout(() => mediaRecorder.stop(), 4000);
}
