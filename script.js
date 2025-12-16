/* ================== КАТЕГОРИИ ================== */

const categories = [
  { id:"greetings", title:"Приветствия" },
  { id:"basic_phrases", title:"Основные фразы" },
  { id:"personal_info", title:"Личные данные" },
  { id:"family", title:"Семья" },
  { id:"home", title:"Дом" },
  { id:"food", title:"Еда" },
  { id:"drinks", title:"Питьё" },
  { id:"travel", title:"Путешествия" },
  { id:"transport", title:"Транспорт" },
  { id:"hunting", title:"Охота" },
  { id:"danger", title:"Опасность" }
];

let currentCategory = null;
let currentData = null;
let adminMode = false;

/* ================== ЗАГРУЗКА ================== */

window.onload = () => {
  renderCategories();
};

function renderCategories(){
  const list = document.getElementById("category-list");
  list.innerHTML = "";

  categories.forEach(cat=>{
    const d = document.createElement("div");
    d.className = "category";
    d.textContent = cat.title;
    d.onclick = ()=>loadCategory(cat);
    list.appendChild(d);
  });
}

async function loadCategory(cat){
  currentCategory = cat;
  document.getElementById("content-title").textContent = cat.title;

  const res = await fetch(`categories/${cat.id}.json`);
  currentData = await res.json();

  renderPhrases(currentData.items);
}

/* ================== РЕНДЕР ================== */

function renderPhrases(items){
  const c = document.getElementById("content");
  c.innerHTML = "";

  items.forEach((p,i)=>{
    const file = normalizePron(p.pron)+".mp3";

    const div = document.createElement("div");
    div.className="phrase";
    div.innerHTML = `
      <p><b>RU:</b> ${p.ru}</p>
      <p><b>ING:</b> ${p.ing}</p>
      <p><b>PRON:</b> ${p.pron}</p>

      <button onclick="playAudio('${currentCategory.id}','${file}')">🔊</button>
      <span id="ai-${currentCategory.id}-${i}" class="audio-indicator">⚪</span>

      ${adminMode ? `
        <button onclick="startRecording('${currentCategory.id}','${p.pron}')">🎤</button>
      ` : ""}
    `;

    c.appendChild(div);
    checkAudio(currentCategory.id, i, file);
  });

  if(adminMode){
    const b=document.createElement("button");
    b.textContent="➕ Добавить фразу";
    b.onclick=addPhrase;
    c.appendChild(b);
  }
}

/* ================== ПОИСК ================== */

async function searchPhrases(){
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  if(!q) return;

  const content = document.getElementById("content");
  content.innerHTML = "";

  // 🔹 поиск в текущей категории
  if(currentCategory && currentData){
    const res = currentData.items.filter(p =>
      p.ru.toLowerCase().includes(q) ||
      p.ing.toLowerCase().includes(q) ||
      p.pron.toLowerCase().includes(q)
    );
    document.getElementById("content-title").textContent="Поиск в категории";
    renderPhrases(res);
    return;
  }

  // 🔹 глобальный поиск
  document.getElementById("content-title").textContent="Результаты поиска";

  for(const cat of categories){
    const r = await fetch(`categories/${cat.id}.json`);
    const d = await r.json();

    const found = d.items.filter(p =>
      p.ru.toLowerCase().includes(q) ||
      p.ing.toLowerCase().includes(q) ||
      p.pron.toLowerCase().includes(q)
    );

    if(!found.length) continue;

    const h = document.createElement("h3");
    h.textContent = cat.title;
    content.appendChild(h);

    found.forEach(p=>{
      const div=document.createElement("div");
      div.className="phrase";
      div.innerHTML=`
        <p><b>RU:</b> ${p.ru}</p>
        <p><b>ING:</b> ${p.ing}</p>
        <p><b>PRON:</b> ${p.pron}</p>
      `;
      content.appendChild(div);
    });
  }
}

/* ================== АУДИО ================== */

function playAudio(cat,file){
  new Audio(`audio/${cat}/${file}?v=${Date.now()}`)
    .play()
    .catch(()=>alert("Аудио не найдено"));
}

function checkAudio(cat,i,file){
  fetch(`audio/${cat}/${file}`, { method:"HEAD" })
    .then(r=>{
      if(r.ok){
        const el = document.getElementById(`ai-${cat}-${i}`);
        if(el) el.textContent="🟢";
      }
    })
    .catch(()=>{});
}

/* ================== АДМИН ================== */

function adminLogin(){
  const t=document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");
  localStorage.setItem("gh_token",t);
  adminMode=true;
  document.getElementById("admin-status").textContent="✓ Админ";
  if(currentData) renderPhrases(currentData.items);
}

function addPhrase(){
  const ru=prompt("RU");
  const ing=prompt("ING");
  const pron=prompt("PRON");
  if(!ru||!ing||!pron) return;
  currentData.items.push({ru,ing,pron});
  renderPhrases(currentData.items);
}

/* ================== УТИЛИТЫ ================== */

function normalizePron(p){
  return p.toLowerCase().trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-z0-9_]/g,"");
}
