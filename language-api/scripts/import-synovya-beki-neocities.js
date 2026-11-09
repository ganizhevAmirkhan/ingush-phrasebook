/**
 * Import bilingual «Сыновья Беки» learning pages from ingushwarrior.neocities.org
 * into corpus story JSON (RU gloss + ING phrase pairs).
 */
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "data", "external", "synovya-beki");
const CORPUS = path.join(__dirname, "..", "data", "corpus", "stories", "synovya-beki.json");
const PAGES = ["page1.html", "page2.html"];

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "");
}

function fixPalochka(s) {
  return (s || "").replace(/!/g, "1");
}

function parsePairs(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const pairs = [];
  let bufIng = [];
  for (const line of lines) {
    // Russian gloss in parentheses
    const gloss = line.match(/^\((.+)\)\s*$/);
    if (gloss) {
      const ru = gloss[1].trim();
      const ing = fixPalochka(bufIng.join(" ").trim());
      bufIng = [];
      if (ing && ru && ru.length > 1 && ing.length > 1) {
        // drop dictionary-style long morphology notes as primary if too long?
        pairs.push({ ru, ing });
      }
      continue;
    }
    // skip headers / latin phonetics-only lines
    if (/^(Хьалхара дакъа|Первая часть|ОагIув|Страница|Ẋælx)/i.test(line)) continue;
    if (/^[0-9]+$/.test(line)) continue;
    if (/^[A-Za-zẊæłŋʃʧʤʹʼ\s\d]+$/.test(line) && !/[а-яё]/i.test(line)) continue;
    bufIng.push(line);
  }
  return pairs;
}

function dedupe(pairs) {
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    const key = `${p.ru.toLowerCase()}||${p.ing.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = [];
  for (const page of PAGES) {
    const url = `https://ingushwarrior.neocities.org/${page}`;
    process.stdout.write(`Fetch ${url}…\n`);
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
      process.stdout.write(`  skip ${r.status}\n`);
      continue;
    }
    const html = await r.text();
    fs.writeFileSync(path.join(OUT_DIR, page), html, "utf8");
    const text = stripTags(html);
    fs.writeFileSync(path.join(OUT_DIR, page.replace(/\.html$/, ".txt")), text, "utf8");
    const pairs = parsePairs(text);
    process.stdout.write(`  pairs ${pairs.length}\n`);
    if (pairs[0]) process.stdout.write(`  sample RU=${pairs[0].ru}\n  sample ING=${pairs[0].ing}\n`);
    all.push(...pairs);
  }

  const paragraphs = dedupe(all);
  const story = {
    id: "story_synovya_beki_001",
    title: "Сыновья Беки",
    titleIng: "Iаи бIаьстии вIашагIкъасташ",
    level: "B2",
    genre: "novella",
    authorRu: "А. Х. Боков",
    translator: "учебный разбор (ingushwarrior) / оригинал ингушский",
    source: "https://ingushwarrior.neocities.org/",
    paragraphs
  };
  fs.writeFileSync(CORPUS, JSON.stringify(story, null, 2) + "\n", "utf8");
  process.stdout.write(`\nTOTAL pairs: ${paragraphs.length}\nOUT: ${CORPUS}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
