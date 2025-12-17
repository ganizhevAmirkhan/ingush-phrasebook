async function startRecording(category, pron){
  const token = window.githubToken;
  if(!token) return alert("Нет GitHub Token");

  const stream = await navigator.mediaDevices.getUserMedia({audio:true});
  const rec = new MediaRecorder(stream,{mimeType:"audio/webm"});
  let chunks = [];

  rec.ondataavailable = e => chunks.push(e.data);

  rec.onstop = async () => {
    stream.getTracks().forEach(t=>t.stop());
    const webm = new Blob(chunks,{type:"audio/webm"});
    const mp3 = await webmToMp3(webm);
    await uploadMp3(category, pron, mp3, token);

    // обновляем всё (важно для поиска)
    if(typeof preloadAllCategories === "function") await preloadAllCategories();
    if(typeof renderCurrentView === "function") renderCurrentView();
  };

  rec.start();
  setTimeout(()=>rec.stop(), 4000);
}

async function webmToMp3(blob){
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const enc = new lamejs.Mp3Encoder(1, buf.sampleRate, 64);

  const samples = buf.getChannelData(0);
  let mp3 = [];

  for(let i=0;i<samples.length;i+=1152){
    const chunk = samples.subarray(i,i+1152);
    const buf16 = new Int16Array(chunk.length);
    for(let j=0;j<chunk.length;j++) buf16[j] = Math.max(-1, Math.min(1, chunk[j])) * 32767;

    const d = enc.encodeBuffer(buf16);
    if(d.length) mp3.push(d);
  }

  const end = enc.flush();
  if(end.length) mp3.push(end);

  return new Blob(mp3,{type:"audio/mp3"});
}

async function uploadMp3(cat, pron, blob, token){
  const file = normalizePron(pron) + ".mp3";
  const path = `audio/${cat}/${file}`;
  const url = `https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{headers:{Authorization:`token ${token}`}});
  if(check.ok) sha = (await check.json()).sha;

  const reader = new FileReader();
  const base64 = await new Promise((resolve, reject)=>{
    reader.onload = ()=>resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const put = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:`audio ${file}`,
      content: base64,
      sha
    })
  });

  if(!put.ok){
    const txt = await put.text().catch(()=> "");
    alert("Ошибка загрузки аудио в GitHub: " + put.status + "\n" + txt);
  }
}
