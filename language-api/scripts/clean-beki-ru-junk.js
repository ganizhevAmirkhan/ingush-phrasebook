const fs = require("node:fs");
const path = require("node:path");

const sources = [
  path.join(__dirname, "..", "data", "external", "synovya-beki", "ru-synovya-beki.txt"),
  path.join(process.env.USERPROFILE || "", "Desktop", "Сыновья-Беки-RU.txt"),
];

function clean(text) {
  // Site pages were scraped as: STORY / "Перейти к странице" / JUNK / "Перейти к странице" / STORY / ...
  const parts = text.split(/Перейти к странице:/);
  const stories = [];
  for (let i = 0; i < parts.length; i += 2) {
    let chunk = parts[i];
    // drop leading pagination left after a header "Перейти к странице"
    chunk = chunk.replace(/^\s*(?:&larr;|←)?\s*предыдущая[\s\S]*?следующая\s*(?:&rarr;|→)?\s*/i, "");
    chunk = chunk
      .replace(/&larr;/gi, "")
      .replace(/&rarr;/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#\d+;/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!chunk) continue;
    // skip leftover pure-junk fragments if any even part is polluted
    if (/Обсудить материал на форуме|groznycity\.ru|Разработано на CMS DJEM/i.test(chunk) && chunk.length < 4000) {
      continue;
    }
    stories.push(chunk);
  }
  return (stories.join("\n\n") + "\n").replace(/\n{3,}/g, "\n\n");
}

const primary = sources.find((p) => fs.existsSync(p));
if (!primary) {
  console.error("RU file not found");
  process.exit(1);
}

const raw = fs.readFileSync(primary, "utf8");
const cleaned = clean(raw);
process.stdout.write(`source=${primary}\nbefore=${raw.length} after=${cleaned.length} pages~=${cleaned.split(/\n\n/).length}\n`);
process.stdout.write(cleaned.slice(0, 280) + "\n---\n");
process.stdout.write(cleaned.slice(-280) + "\n");

for (const dest of sources) {
  fs.writeFileSync(dest, cleaned, "utf8");
  process.stdout.write(`wrote ${dest}\n`);
}
