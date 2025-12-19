async function startRecording(category, id){
  const token = githubToken;
  if(!token) return alert("Нет GitHub Token");

  let stream;
  try{
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    alert("Нет доступа к микрофону");
    return;
  }

  // Пишем в webm (так умеют почти все), потом конвертируем в mp3
  let mimeType = "audio/webm;codecs=opus";
  if(!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";

  let rec;
  try{
    rec = new MediaRecorder(stream, { mimeType });
  }catch(e){
    alert("MediaRecorder не поддерживается этим браузером");
    stream.getTracks().forEach(t=>t.stop());
    return;
  }

  const chunks = [];
  rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };

  rec.onstop = async () => {
    stream.getTracks().forEach(t=>t.stop());

    try{
      const webmBlob = new Blob(chunks, { type: mimeType });
      const mp3Blob = await webmToMp3(webmBlob);

      const fileName = `${id}.mp3`;
      await uploadMp3(category, fileName, mp3Blob, token);

      // скажем script.js обновить индикатор + JSON + поиск/категории
      if(typeof window.onAudioUploaded === "function"){
        await window.onAudioUploaded(category, id, fileName);
      }

    }catch(err){
      console.error(err);
      alert("Ошибка записи/конвертации");
    }
  };

  rec.start();
  setTimeout(()=>rec.stop(), 4000);
}

async function webmToMp3(blob){
  // важно: AudioContext должен быть доступен (часто требует user gesture — у нас он есть, запись по кнопке)
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const ab = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(ab);

  const sampleRate = audioBuffer.sampleRate;
  const mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, 64);

  const samples = audioBuffer.getChannelData(0);

  const blockSize = 1152;
  let mp3Data = [];

  for(let i=0; i<samples.length; i+=blockSize){
    const chunk = samples.subarray(i, i+blockSize);

    // float32 -> int16
    const int16 = new Int16Array(chunk.length);
    for(let j=0; j<chunk.length; j++){
      let s = Math.max(-1, Math.min(1, chunk[j]));
      int16[j] = s < 0 ? s * 32768 : s * 32767;
    }

    const buf = mp3Encoder.encodeBuffer(int16);
    if(buf.length) mp3Data.push(buf);
  }

  const end = mp3Encoder.flush();
  if(end.length) mp3Data.push(end);

  return new Blob(mp3Data, { type:"audio/mpeg" });
}

async function uploadMp3(cat, fileName, blob, token){
  const path = `audio/${cat}/${fileName}`;
  const url  = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{headers:{Authorization:`token ${token}`}});
  if(check.ok) sha = (await check.json()).sha;

  const base64 = await blobToBase64(blob);

  const put = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`audio ${fileName}`,
      content: base64,
      sha
    })
  });

  if(!put.ok){
    const txt = await put.text().catch(()=>"(no details)");
    throw new Error("Ошибка загрузки mp3: " + txt);
  }
}

function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
