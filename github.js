const GH_OWNER = "ganizhevamirkhan";
const GH_REPO  = "ingush-phrasebook";
const GH_BRANCH = "main";

// токен сохраняется автоматически
const tokenInput = document.getElementById("gh-token");
if (tokenInput) {
  tokenInput.value = localStorage.getItem("gh_token") || "";
  tokenInput.oninput = () =>
    localStorage.setItem("gh_token", tokenInput.value);
}

// ========== АУДИО ==========
async function uploadAudioToGitHub(blob, pron, category) {
  const token = localStorage.getItem("gh_token");
  if (!token) return alert("Введите GitHub Token");

  const path = `audio/${category}/${pron}.webm`;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

  const content = await blobToBase64(blob);

  let sha = null;
  const check = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  if (check.ok) sha = (await check.json()).sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `audio ${pron}`,
      content,
      sha,
      branch: GH_BRANCH
    })
  });

  if (!res.ok) {
    alert("Ошибка сохранения аудио");
    return;
  }

  alert("Аудио сохранено в GitHub");
}

// ========== JSON КАТЕГОРИИ ==========
async function saveCategoryToGitHub() {
  const token = localStorage.getItem("gh_token");
  if (!token) return alert("Введите GitHub Token");

  const path = `categories/${currentCategory}.json`;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

  let sha = null;
  const check = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  if (check.ok) sha = (await check.json()).sha;

  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(currentData, null, 2)))
  );

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `update ${currentCategory}`,
      content,
      sha,
      branch: GH_BRANCH
    })
  });

  if (!res.ok) {
    alert("Ошибка сохранения категории");
    return;
  }

  renderPhrases();
}

// ========== УТИЛИТА ==========
function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

