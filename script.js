let admin=false,category=null,data=null;

function adminLogin(){
  setToken(document.getElementById("gh-token").value);
  admin=true;
  document.getElementById("admin-status").textContent="✓";
  if(data) render();
}

async function loadCategory(c){
  category=c;
  data=await (await fetch(`categories/${c}.json`)).json();
  render();
}

function render(){
  const c=document.getElementById("content");
  c.innerHTML=`<h2>${category}</h2>`;

  data.items.forEach(p=>{
    c.innerHTML+=`
    <div class="phrase">
      <b>RU:</b> ${p.ru}<br>
      <b>ING:</b> ${p.ing}<br>
      <b>PRON:</b> ${p.pron}
      <span class="ok">●</span><br>

      <button onclick="new Audio('audio/${category}/${p.pron}.webm').play()">🔊</button>

      ${admin?`
        <button onclick="recordAudio('${category}','${p.pron}')">🎤</button>
        <button onclick="stopAudio()">⏹</button>
      `:""}
    </div>`;
  });

  if(admin){
    c.innerHTML+=`<button onclick="saveCategory()">💾 Сохранить категорию</button>`;
  }
}

async function saveCategory(){
  await putFile(
    `categories/${category}.json`,
    JSON.stringify(data,null,2),
    `update ${category}`
  );
  alert("Категория сохранена");
}

(async()=>{
  const cats=await (await fetch("categories")).text();
  document.getElementById("sidebar").innerHTML=
    cats.match(/\w+\.json/g)
    .map(f=>`<div onclick="loadCategory('${f.replace('.json','')}')">${f.replace('.json','')}</div>`)
    .join("");
})();
