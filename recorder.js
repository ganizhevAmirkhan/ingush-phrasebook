async function startRecording(cat,pron){
  const token = localStorage.getItem("gh_token");
  if(!token) return alert("Нет GitHub Token");

  const stream = await navigator.mediaDevices.getUserMedia({audio:true});
  const rec = new MediaRecorder(stream,{mimeType:"audio/webm"});
  let chunks=[];

  rec.ondataavailable=e=>chunks.push(e.data);
  rec.onstop=async()=>{
    stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:"audio/webm"});
    const reader=new FileReader();

    reader.onload=async()=>{
      const base64=reader.result.split(",")[1];
      const file=normalizePron(pron)+".mp3";
      const path=`audio/${cat}/${file}`;

      let sha=null;
      const url=`https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;
      const check=await fetch(url,{headers:{Authorization:`token ${token}`}});
      if(check.ok) sha=(await check.json()).sha;

      await fetch(url,{
        method:"PUT",
        headers:{
          Authorization:`token ${token}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          message:`audio ${file}`,
          content:base64,
          sha
        })
      });

      alert("Аудио сохранено");
    };

    reader.readAsDataURL(blob);
  };

  rec.start();
  setTimeout(()=>rec.stop(),4000);
}
