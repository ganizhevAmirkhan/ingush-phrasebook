const categories = [
 "greetings","basic_phrases","personal_info","family","home",
 "food","drinks","travel","transport","hunting",
 "danger","thermal","orientation","weather","emotions",
 "health","help","commands","tools","animals",
 "time","numbers","colors","money","shop",
 "city","village","guests","communication","work","misc"
];

let currentCategory = null;
let currentData = null;

window.onload = loadCategories;

function loadCategories() {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className="category";
    d.textContent=cat;
    d.onclick=()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory=cat;
  document.getElementById("content-title").textContent=cat;
  const res=await fetch(`categories/${cat}.json`);
  currentData=await res.json();
  renderPhrases();
}

function renderPhrases(){
  const content=document.getElementById("content");
  content.innerHTML="";
  currentData.items.forEach((item,i)=>{
    const file=normalizePron(item.pron)+".mp3";
    const div=document.createElement("div");
    div.className="phrase";
    div.innerHTML=`
      <p><b>RU:</b> ${item.ru}</p>
      <p><b>ING:</b> ${item.ing}</p>
      <p><b>PRON:</b> ${item.pron}</p>

      <button onclick="playAudio('${currentCategory}','${file}')">🔊</button>
      <span class="audio-indicator" id="ai-${i}">⚪</span>

      ${adminMode?`
        <button onclick="startRecording('${currentCategory}','${item.pron}')">🎤</button>
        <button onclick="editPhrase(${i})">✏</button>
        <button onclick="deletePhrase(${i})">🗑</button>
      `:""}
    `;
    content.appendChild(div);
    checkAudio(i,file);
  });

  if(adminMode){
    const b=document.createElement("button");
    b.textContent="➕ Добавить фразу";
    b.onclick=addPhrase;
    content.appendChild(b);
  }
}

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио ещё не доступно"));
}

function checkAudio(i,file){
  fetch(`audio/${currentCategory}/${file}`,{method:"HEAD"})
   .then(r=>{if(r.ok){
     document.getElementById(`ai-${i}`).textContent="🟢";
   }});
}

function normalizePron(p){
  return p.toLowerCase().trim().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
}
