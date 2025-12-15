let mediaRecorder = null;
let chunks = [];

async function startRecording(index) {
  if (!window.adminMode) return alert("Только админ!");
  if (!window.currentCategory) return alert("Сначала открой категорию.");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    chunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${index}.webm`; // потом конвертируешь в mp3 и кладёшь в audio/<category>/<index>.mp3
      a.click();
      alert("Аудио скачано. Конвертируй в mp3 и загрузи в папку audio/категория/индекс.mp3");
    };

    mediaRecorder.start();
    alert("Запись началась. Нажми ОК — через 3 секунды остановлю запись.");

    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    }, 3000);
  } catch (e) {
    console.error(e);
    alert("Не удалось получить доступ к микрофону.");
  }
}
