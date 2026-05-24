const REPO="ganizhevamirkhan/ingush-phrasebook";
const BRANCH="main";

function setToken(t){localStorage.setItem("gh_token",t)}
function getToken(){return localStorage.getItem("gh_token")}

function b64(s){
  return btoa(unescape(encodeURIComponent(s)));
}

async function putFile(path,content,message){
  const token=getToken();
  if(!token) throw "NO TOKEN";

  let sha=null;
  const url=`https://api.github.com/repos/${REPO}/contents/${path}`;
  const r=await fetch(url,{headers:{Authorization:`token ${token}`}});
  if(r.ok) sha=(await r.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message,
      content:b64(content),
      sha,
      branch:BRANCH
    })
  });
}
