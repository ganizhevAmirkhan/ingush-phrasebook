/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-phrasebook";
const BRANCH = "main";

/* ================= STATE ================= */
let currentCategory = null;
let currentData = null;
let allPhrases = [];
let phraseIndex = {};
let currentView = "category";
let searchResults = [];
let lastSearchQuery = "";
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

let editingItemId = null;

/* ================= UTILS ================= */
const safe = v => (v ?? "").toString();
const low  = v => safe(v).toLowerCase();

function genId(){
  return "f_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
}

function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64){
  return decodeURIComponent(escape(atob(b64)));
}

/* ================= INIT ================= */
window.onload = async ()=>{
  loadCategories();
  await preloadAllCategories();

  if(githubToken){
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }

  setupSearchSuggest();
};

/* ================= AI ================= */
function saveAiKey(){
  const key = document.getElementById("ai-key").value.trim();
  if(!key) return alert("Введите OpenAI API ключ");
  localStorage.setItem("openaiKey", key);
  document.getElementById("ai-status").textContent = "✓";
}

async function callAI(prompt){
  const key = localStorage.getItem("openaiKey");
  if(!key){
    alert("Нет OpenAI API ключа");
    return "";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + key,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {role:"system",content:"Ты помощник для разговорника."},
        {role:"user",content:prompt}
      ]
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function aiFixRu(){
  const ru = editRu.value;
  const out = await callAI("Исправь орфографию:\n"+ru);
  if(out) editRu.value = out;
}
async function aiTranslateIng(){
  const out = await callAI("Переведи на ингушский:\n"+editRu.value);
  if(out) editIng.value = out;
}
async function aiMakePron(){
  const out = await callAI("Сделай латинскую транскрипцию:\n"+editIng.value);
  if(out) editPron.value = out.toLowerCase();
}

/* ================= EDIT MODAL ================= */
const editModal = document.getElementById("edit-modal");
const editRu = document.getElementById("edit-ru");
const editIng = document.getElementById("edit-ing");
const editPron = document.getElementById("edit-pron");

async function editById(id){
  editingItemId = id;
  const cat = phraseIndex[id];
  const d = await loadCategoryDataFromGitHubAPI(cat);
  const it = d.items.find(x=>x.id===id);

  editRu.value = it.ru;
  editIng.value = it.ing;
  editPron.value = it.pron;

  editModal.classList.remove("hidden");
}

function closeEdit(){
  editModal.classList.add("hidden");
  editingItemId = null;
}

async function saveEdit(){
  const cat = phraseIndex[editingItemId];
  const d = await loadCategoryDataFromGitHubAPI(cat);
  const it = d.items.find(x=>x.id===editingItemId);

  it.ru = editRu.value.trim();
  it.ing = editIng.value.trim();
  it.pron = editPron.value.trim();

  await saveCategoryData(cat, d);
  updateCacheFromItem(cat, it);

  if(currentCategory===cat) currentData = d;

  closeEdit();
  renderCurrentView();
}

/* ================= DATA ================= */
const categories = [
  "greetings","basic_phrases","family","food","travel","health","misc"
];
const categoryTitles = {
  greetings:"Приветствия",
  basic_phrases:"Базовые фразы",
  family:"Семья",
  food:"Еда",
  travel:"Путешествия",
  health:"Здоровье",
  misc:"Разное"
};

/* ================= RENDER ================= */
function renderPhrase(item){
  return `
  <div class="phrase">
    <p><b>ING:</b> ${safe(item.ing)}</p>
    <p><b>RU:</b> ${safe(item.ru)}</p>
    <p><b>PRON:</b> ${safe(item.pron)}</p>
    ${adminMode ? `<button onclick="editById('${item.id}')">✏</button>`:""}
  </div>`;
}

function renderCategory(){
  content.innerHTML = "";
  currentData.items.forEach(it=>{
    it.category=currentCategory;
    content.insertAdjacentHTML("beforeend",renderPhrase(it));
  });
}

function renderCurrentView(){
  renderCategory();
}

/* ================= LOAD ================= */
async function loadCategory(cat){
  currentCategory = cat;
  contentTitle.textContent = categoryTitles[cat];
  const r = await fetch(`categories/${cat}.json`);
  currentData = await r.json();
  renderCategory();
}

function loadCategories(){
  categoryList.innerHTML="";
  categories.forEach(c=>{
    const d=document.createElement("div");
    d.className="category";
    d.textContent=categoryTitles[c];
    d.onclick=()=>loadCategory(c);
    categoryList.appendChild(d);
  });
}

/* ================= SEARCH ================= */
function setupSearchSuggest(){}

/* ================= CACHE ================= */
async function preloadAllCategories(){
  for(const cat of categories){
    try{
      const r=await fetch(`categories/${cat}.json`);
      const d=await r.json();
      d.items.forEach(it=>{
        allPhrases.push({...it,category:cat});
        phraseIndex[it.id]=cat;
      });
    }catch{}
  }
}

/* ================= GITHUB ================= */
async function loadCategoryDataFromGitHubAPI(cat){
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`,
    {headers:{Authorization:`token ${githubToken}`}}
  );
  const json = await res.json();
  return JSON.parse(b64DecodeUnicode(json.content));
}

async function saveCategoryData(cat,data){
  const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/categories/${cat}.json`;
  const r=await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  const sha=r.ok?(await r.json()).sha:null;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"update",
      content:b64EncodeUnicode(JSON.stringify(data,null,2)),
      sha
    })
  });
}

function updateCacheFromItem(cat,it){
  const p=allPhrases.find(x=>x.id===it.id);
  if(p){
    p.ru=it.ru;p.ing=it.ing;p.pron=it.pron;
  }
}
