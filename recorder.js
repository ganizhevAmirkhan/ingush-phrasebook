let mediaRecorder;
let audioChunks = [];
let recPron = null;
let recCategory = null;

async function startRecording(pron, category, maxSec = 4) {
  recPron = normalizePron(pron);
  recCategory = category;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus",
    audioBitsPerSecond: 32000
  });

  audioChunks = [];
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.start();

  setTimeout(() => {
    if (mediaRecorder.state === "recording") {
      stopRecording();
    }
  }, maxSec * 1000);
}

function stopRecording() {
  mediaRecorder.stop();

  mediaRecorder.onstop = async () => {
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    await uploadAudioToGitHub(blob, recPron, recCategory);
  };
}
