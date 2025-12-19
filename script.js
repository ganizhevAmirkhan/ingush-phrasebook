const categories = ["greetings","basic_phrases","misc"];
const categoryTitles = {
  greetings:"Приветствия",
  basic_phrases:"Базовые фразы",
  misc:"Разное"
};

let currentCategory = null;
let currentData = null;
let onlyNoAudio = false;

let githubToken = localStorage.getItem("githubToken");

window.onload = () => {
  loadCategories();
};

function loadCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(cat=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryTitles[cat];
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory=cat;
  document.getElementById("content-title").textContent=categoryTitles[cat];
  const r=await fetch(`categories/${cat}.json`);
  currentData=await r.json();
  render();
}

function render(){
  const c=document.getElementById("content");
  c.innerHTML="";

  let total=0, noAudio=0;

  currentData.items.forEach(it=>{
    const hasAudio = it.audio;
    total++;
    if(!hasAudio) noAudio++;

    if(onlyNoAudio && hasAudio) return;

    const d=document.createElement("div");
    d.className="phrase"+(hasAudio?" done":"");
    d.id="ph-"+it.id;

    d.innerHTML=`
      <p><b>ING:</b> ${it.ing}</p>
      <p><b>RU:</b> ${it.ru}</p>
      <p><b>PRON:</b> ${it.pron}</p>

      <button onclick="recordById('${it.id}')">🎤</button>
      ${hasAudio?'<span class="audio-ok">✔</span>':""}
    `;
    c.appendChild(d);
  });

  document.getElementById("audio-stats").textContent =
    `Озвучено: ${total-noAudio} | Без озвучки: ${noAudio}`;
}

function toggleOnlyNoAudio(){
  onlyNoAudio=!onlyNoAudio;
  render();
}

function adminLogin(){
  const t=document.getElementById("gh-token").value.trim();
  if(!t) return;
  githubToken=t;
  localStorage.setItem("githubToken",t);
  document.getElementById("admin-status").textContent="✓ Админ";
}

async function recordById(id){
  startRecording(currentCategory,id);
}

window.onAudioUploaded = async function(cat,id,file){
  const it=currentData.items.find(x=>x.id===id);
  if(it){
    it.audio=file;
    render();

    // 🔥 автопереход
    const next=currentData.items.find(x=>!x.audio);
    if(next){
      document.getElementById("ph-"+next.id)
        ?.scrollIntoView({behavior:"smooth",block:"center"});
    }
  }
};
