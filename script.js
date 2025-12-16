const categories = [
  {id:"greetings",ru:"Приветствия"},
  {id:"basic_phrases",ru:"Основные фразы"},
  {id:"personal_info",ru:"Личные данные"},
  {id:"family",ru:"Семья"},
  {id:"home",ru:"Дом"},
  {id:"food",ru:"Еда"},
  {id:"drinks",ru:"Питьё"},
  {id:"travel",ru:"Путешествия"},
  {id:"transport",ru:"Транспорт"},
  {id:"hunting",ru:"Охота"},
  {id:"danger",ru:"Опасность"},
  {id:"thermal",ru:"Тепловизор"},
  {id:"orientation",ru:"Ориентация"},
  {id:"weather",ru:"Погода"},
  {id:"emotions",ru:"Эмоции"},
  {id:"health",ru:"Здоровье"},
  {id:"help",ru:"Помощь"},
  {id:"commands",ru:"Команды"},
  {id:"tools",ru:"Инструменты"},
  {id:"animals",ru:"Животные"},
  {id:"time",ru:"Время"},
  {id:"numbers",ru:"Числа"}
];

let currentCategory = null;
let currentData = null;

window.onload = loadCategories;

function loadCategories(){
  const list=document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(c=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=c.ru;
    d.onclick=()=>loadCategory(c.id,c.ru);
    list.appendChild(d);
  });
}

async function loadCategory(id,ru){
  currentCategory=id;
  document.getElementById("content-title").textContent=ru;
  const res=await fetch(`categories/${id}.json`);
  currentData=await res.json();
  renderPhrases(currentData.items);
}

function renderPhrases(items){
  const content=document.getElementById("content");
  content.innerHTML="";

  items.forEach((item,i)=>{
    const file=normalizePron(item.pron)+".mp3";
    const div=document.createElement("div");
    div.className="phrase";
    div.innerHTML=`
      <b>RU:</b> ${item.ru}<br>
      <b>ING:</b> ${item.ing}<br>
      <b>PRON:</b> ${item.pron}<br>

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
    const add=document.createElement("button");
    add.textContent="➕ Добавить фразу";
    add.onclick=addPhrase;
    content.appendChild(add);

    const dl=document.createElement("button");
    dl.textContent="💾 Скачать категорию";
    dl.onclick=downloadCategory;
    content.appendChild(dl);
  }
}

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`).play()
    .catch(()=>alert("Аудио не найдено"));
}

function checkAudio(i,file){
  fetch(`audio/${currentCategory}/${file}`,{method:"HEAD"})
    .then(r=>{
      if(r.ok) document.getElementById(`ai-${i}`).textContent="🟢";
    });
}

function normalizePron(p){
  return p.toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}

function searchPhrases(){
  if(!currentData) return;
  const q=document.getElementById("search-input").value.toLowerCase();
  const filtered=currentData.items.filter(it=>
    `${it.ru} ${it.ing} ${it.pron}`.toLowerCase().includes(q)
  );
  renderPhrases(filtered);
}

function downloadCategory(){
  const blob=new Blob(
    [JSON.stringify(currentData,null,2)],
    {type:"application/json"}
  );
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${currentCategory}.json`;
  a.click();
}
