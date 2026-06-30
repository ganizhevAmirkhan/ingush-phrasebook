const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const SPREAD = path.join(__dirname, "..", "data", "external", "ashik-kerib", "spreads");

function linesToFlow(raw) {
  const lines = (raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\d:|\)\}\*©\s]{1,4}$/.test(l) && !/^\d{1,2}$/.test(l));
  let text = "";
  for (let line of lines) {
    line = line.replace(/^[)\}\|:\*©\s]+|[)\}\|:\*©\s]+$/g, "").trim();
    if (!line) continue;
    if (text.endsWith("-")) text = text.slice(0, -1) + line;
    else if (text) text += " " + line;
    else text = line;
  }
  return text.replace(/\s+/g, " ").trim();
}

async function main() {
  const leftRaw = fs.readFileSync(path.join(SPREAD, "book-6.txt"), "utf8");
  const rightRaw = fs.readFileSync(path.join(SPREAD, "book-7.txt"), "utf8");
  const p6 = linesToFlow(leftRaw);
  const p7 = linesToFlow(rightRaw);
  const merged = `${p6}\n\n${p7}`;

  const esc = (s) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Стр. 6–7</title></head><body>
<h2 style="font-family:Georgia">Ашик-Кериб — стр. 6 + 7 (сплошной текст)</h2>
<p style="font-size:13pt;line-height:1.65;font-family:Georgia;text-align:justify">${esc(p6)} ${esc(p7)}</p>
</body></html>`;

  const out = path.join(SPREAD, "book-6-7-merged.txt");
  await fsp.writeFile(out, merged, "utf8");
  const desktop = path.join(process.env.USERPROFILE, "Desktop", "Ашик-Кериб-стр-6-7.doc");
  await fsp.writeFile(desktop, "\uFEFF" + html, "utf8");
  const docs = path.join(process.env.USERPROFILE, "Documents", "ОСР", "Г1алг1ай  лекции", "Ашик-Кериб-стр-6-7.doc");
  try {
    await fsp.writeFile(docs, "\uFEFF" + html, "utf8");
  } catch {
    /* ignore */
  }
  console.log("Стр.6:", p6.length, "симв.");
  console.log("Стр.7:", p7.length, "симв.");
  console.log("Desktop:", desktop);
  console.log("\n--- стр. 6 ---\n", p6.slice(0, 500));
  console.log("\n--- стр. 7 ---\n", p7.slice(0, 500));
}

main();
