let mediaRecorder;
let chunks = [];

async function startRecording(category, pron) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus",
    audioBitsPerSecond: 32000
  });

  chunks = [];

  mediaRecorder.ondataavailable = e => chunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const arrayBuffer = await blob.arrayBuffer();
    const binary = String.fromCharCode(...new Uint8Array(arrayBuffer));

    await githubPut(
      `audio/${category}/${pron}.webm`,
      binary,
      `Add audio ${category}/${pron}`
    );

    alert("Аудио сохранено в GitHub");
  };

  mediaRecorder.start();
}

function stopRecording() {
  mediaRecorder.stop();
}
