async function uploadToGitHub(path, content, token, message = "Update") {
  const apiUrl = `https://api.github.com/repos/ganizhevamirkhan/ingush-phrasebook/contents/${path}`;

  let sha = null;

  // Проверяем, существует ли файл
  const check = await fetch(apiUrl, {
    headers: { Authorization: `token ${token}` }
  });

  if (check.ok) {
    const data = await check.json();
    sha = data.sha;
  }

  const body = {
    message,
    content: btoa(
      typeof content === "string"
        ? content
        : JSON.stringify(content, null, 2)
    ),
    sha
  };

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("GitHub upload failed");
  }

  return await res.json();
}

// ===== JSON =====
async function uploadJSONToGitHub(path, json, token) {
  return uploadToGitHub(path, json, token, "Update category");
}

// ===== AUDIO =====
async function uploadAudioToGitHub(path, blob, token) {
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  return uploadToGitHub(path, base64, token, "Add audio");
}
