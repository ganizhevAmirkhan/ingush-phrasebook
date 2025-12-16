let recorder,chunks=[];

async function recordAudio(cat,pron){
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  recorder=new MediaRecorder(stream,{mimeType:"audio/webm"});
  chunks=[];
  recorder.ondataavailable=e=>chunks.push(e.data);
  recorder.onstop=async()=>{
    const blob=new Blob(chunks);
    const buf=await blob.arrayBuffer();
    const bin=String.fromCharCode(...new Uint8Array(buf));
    await putFile(`audio/${cat}/${pron}.webm`,bin,`audio ${pron}`);
    alert("Аудио сохранено в GitHub");
  };
  recorder.start();
}

function stopAudio(){recorder.stop()}
