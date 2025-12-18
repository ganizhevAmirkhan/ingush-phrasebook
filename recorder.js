let mediaRecorder;
let chunks = [];

async function startRecording(category,id){
  if(!navigator.mediaDevices){
    alert("Запись не поддерживается");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({audio:true});

  mediaRecorder = new MediaRecorder(stream,{ mimeType:"audio/webm" });
  chunks = [];

  mediaRecorder.ondataavailable = e => chunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks,{type:"audio/webm"});
    const file = `${id}.webm`;

    await uploadAudio(category,file,blob);
    alert("Запись сохранена, обнови страницу");
  };

  mediaRecorder.start();
  alert("Запись началась. Нажми ОК для остановки");
  mediaRecorder.stop();
}

async function uploadAudio(category,file,blob){
  const path = `audio/${category}/${file}`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const content = await blobToBase64(blob);

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`Add audio ${file}`,
      content
    })
  });
}

function blobToBase64(blob){
  return new Promise(r=>{
    const fr = new FileReader();
    fr.onload = () => r(fr.result.split(",")[1]);
    fr.readAsDataURL(blob);
  });
}
