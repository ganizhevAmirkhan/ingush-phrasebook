const fs = require("node:fs");
const path = require("node:path");
const p = path.join(__dirname, "..", "data", "external", "synovya-beki", "ru-synovya-beki.txt");
let t = fs.readFileSync(p, "utf8");
const i = t.indexOf("Небо было чистым");
if (i > 0) t = t.slice(i);
t = t
  .replace(/Сыновья Беки\s*Боков А\. Х\./g, "")
  .replace(/\|\s*\d+\s*\|/g, " ")
  .replace(/следующая\s*→/g, "")
  .replace(/←\s*предыдущая/g, "")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
fs.writeFileSync(p, t, "utf8");
const desktop = path.join(process.env.USERPROFILE || "", "Desktop", "Сыновья-Беки-RU.txt");
fs.writeFileSync(desktop, t, "utf8");
process.stdout.write(`clean chars=${t.length}\nDesktop=${desktop}\n`);
process.stdout.write(t.slice(0, 280) + "\n");
