let recorder;
let chunks = [];

function startRecording(index) {
    const seconds = Number(prompt("Длительность записи (сек):", 3));
    if (!seconds) return;

    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
        recorder = new MediaRecorder(stream,{
            mimeType:"audio/webm;codecs=opus",
            audioBitsPerSecond:48000
        });

        chunks = [];
        recorder.ondataavailable = e => chlet recorder;
let chunks = [];

function startRecording(index) {
  if (!adminMode || !githubToken) {
    alert("Нужен админ-доступ");
    return;
  }

  const sec = Number(prompt("Длительность записи (сек):",3));
  if (!sec) return;

  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
    recorder = new MediaRecorder(stream,{
      mimeType:"audio/webm;codecs=opus",
      audioBitsPerSecond:48000
    });

    chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);

    recorder.onstop = () => {
      const blob = new Blob(chunks,{type:"audio/webm"});

      // local fallback
      const r = new FileReader();
      r.onload = () => {
        localStorage.setItem(
          `audio_${currentCategory}_${index}`,
          r.result
        );
        renderPhrases(currentData);
      };
      r.readAsDataURL(blob);

      uploadAudio(blob,index);
    };

    recorder.start();
    setTimeout(()=>recorder.stop(),sec*1000);
  });
}

// =========================
async function uploadAudio(blob,index) {
  const path = `audio/${currentCategory}/${index}.webm`;
  const url = `https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{
    headers:{Authorization:`token ${githubToken}`}
  });
  if (check.ok) sha = (await check.json()).sha;

  const r = new FileReader();
  r.onload = async () => {
    await fetch(url,{
      method:"PUT",
      headers:{
        Authorization:`token ${githubToken}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        message:`Audio ${currentCategory}/${index}`,
        content:r.result.split(",")[1],
        sha
      })
    });
  };
  r.readAsDataURL(blob);
}
unks.push(e.data);

        recorder.onstop = () => {
            const blob = new Blob(chunks,{type:"audio/webm"});
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result;
                localStorage.setItem(
                    `audio_${currentCategory}_${index}`,
                    base64
                );
                uploadAudio(blob,index);
                renderPhrases(currentData);
            };
            reader.readAsDataURL(blob);
        };

        recorder.start();
        setTimeout(()=>recorder.stop(), seconds*1000);
    });
}

// ======================
// UPLOAD TO GITHUB
// ======================
async function uploadAudio(blob,index) {
    const path = `audio/${currentCategory}/${index}.webm`;
    const url = `https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/${path}`;

    let sha = null;
    const check = await fetch(url,{
        headers:{Authorization:`token ${githubToken}`}
    });
    if (check.ok) sha = (await check.json()).sha;

    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(",")[1];
        await fetch(url,{
            method:"PUT",
            headers:{
                Authorization:`token ${githubToken}`,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                message:`Audio ${currentCategory}/${index}`,
                content:base64,
                sha
            })
        });
    };
    reader.readAsDataURL(blob);
}
