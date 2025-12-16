window.adminMode=false;
window.githubToken=null;

function adminLogin(){
  const token=document.getElementById("gh-token").value.trim();
  if(!token) return alert("Введите GitHub Token");
  adminMode=true;
  githubToken=token;
  localStorage.setItem("gh_token",token);
  document.getElementById("admin-status").textContent="✓ Админ";
  if(currentData) renderPhrases(currentData.items);
}

function addPhrase(){
  const ru=prompt("Русский:");
  const ing=prompt("Ингушский:");
  const pron=prompt("PRON (латиница):");
  if(!ru||!ing||!pron) return;
  currentData.items.push({ru,ing,pron});
  saveCategory();
}

function editPhrase(i){
  const it=currentData.items[i];
  it.ru=prompt("RU",it.ru);
  it.ing=prompt("ING",it.ing);
  it.pron=prompt("PRON",it.pron);
  saveCategory();
}

function deletePhrase(i){
  if(!confirm("Удалить?")) return;
  currentData.items.splice(i,1);
  saveCategory();
}

async function saveCategory(){
  const path=`categories/${currentCategory}.json`;
  const url=`https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;

  let sha=null;
  const check=await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  if(check.ok) sha=(await check.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:`Update ${currentCategory}`,
      content:btoa(unescape(
        encodeURIComponent(JSON.stringify(currentData,null,2))
      )),
      sha
    })
  });

  renderPhrases(currentData.items);
}
