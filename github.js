const REPO = "ganizhevamirkhan/ingush-phrasebook";
const BRANCH = "main";

function getToken() {
  return localStorage.getItem("gh_token");
}

function setToken(t) {
  localStorage.setItem("gh_token", t);
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubPut(path, content, message) {
  const token = getToken();
  if (!token) throw new Error("Нет GitHub Token");

  let sha = null;

  const check = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `token ${token}` }
  });

  if (check.ok) {
    const j = await check.json();
    sha = j.sha;
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: toBase64(content),
      sha,
      branch: BRANCH
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }
}
