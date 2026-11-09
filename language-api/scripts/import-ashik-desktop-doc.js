/**
 * Import bilingual Ашик-Кериб from Desktop Word HTML (.doc UTF-16).
 * Usage: node scripts/import-ashik-desktop-doc.js
 */
const fs = require("node:fs");
const path = require("node:path");

const DOC =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || "", "Desktop", "Ашик-Кериб-ру-фразы.doc");
const OUT = path.join(__dirname, "..", "data", "corpus", "stories", "ashik-kerib.json");

function readDoc(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf);
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return buf.toString("utf8");
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<o:p><\/o:p>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractParagraphs(html) {
  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = stripHtml(m[1]);
    if (t.length > 1) paras.push(t);
  }
  return paras;
}

function looksIngush(s) {
  const t = s || "";
  if (/[I1ӏӀ!]/.test(t) && /[а-яё]/i.test(t)) return true;
  if (/(аьлар|цунна|хьо|г1|т1|к1|х1|ц1|ч1|къ|хь|йоахар|вий|дий)/i.test(t)) return true;
  const cyr = (t.match(/[а-яё]/gi) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  return cyr > 8 && latin < 3 && /[ъӏ]/i.test(t);
}

function looksRussian(s) {
  const t = s || "";
  if (/^(Давно|в городе|жил|много|но |хороши|так и|Был|на одной|Магуль)/i.test(t)) return true;
  if (/[а-яё]/i.test(t) && !looksIngush(t)) return true;
  return /[а-яё]/i.test(t) && !/[I1ӏӀ]/.test(t) && !/(аьлар|цунна|г1|т1)/i.test(t);
}

function fixPalochka(s) {
  return (s || "").replace(/!/g, "1");
}

function cleanText(s) {
  return fixPalochka(s)
    .replace(/^[–—\-•]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pairAlternating(paras) {
  const start = paras.findIndex((p) => /Давно тому назад/i.test(p));
  const body = start >= 0 ? paras.slice(start) : paras;
  const pairs = [];
  let i = 0;
  while (i < body.length) {
    const a = cleanText(body[i]);
    const b = cleanText(body[i + 1] || "");
    if (!a) {
      i += 1;
      continue;
    }
    // Prefer RU then ING
    if (b && looksRussian(a) && looksIngush(b)) {
      pairs.push({ ru: a, ing: b });
      i += 2;
      continue;
    }
    if (b && looksIngush(a) && looksRussian(b)) {
      pairs.push({ ru: b, ing: a });
      i += 2;
      continue;
    }
    if (b && looksRussian(a) && !looksRussian(b)) {
      pairs.push({ ru: a, ing: b });
      i += 2;
      continue;
    }
    // orphan: skip noise / titles
    if (/Ашик-Кериб|русск|ингуш|Лермонтов|фразы/i.test(a) && a.length < 40) {
      i += 1;
      continue;
    }
    i += 1;
  }
  return pairs;
}

function dedupe(pairs) {
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    const key = `${p.ru.toLowerCase()}||${p.ing.toLowerCase()}`;
    if (seen.has(key)) continue;
    if (p.ru.length < 2 || p.ing.length < 2) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(DOC)) {
    process.stderr.write(`File not found: ${DOC}\n`);
    process.exit(1);
  }
  const html = readDoc(DOC);
  const paras = extractParagraphs(html);
  const pairs = dedupe(pairAlternating(paras));

  const story = {
    id: "story_ashik_kerib_001",
    title: "Ашик-Кериб",
    titleIng: "Ашик-Кериб",
    level: "B1",
    genre: "novella",
    authorRu: "М. Ю. Лермонтов",
    translator: "С. Озиев",
    source: "ashik-kerib-desktop-doc",
    paragraphs: pairs
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(story, null, 2) + "\n", "utf8");

  process.stdout.write(`DOC: ${DOC}\n`);
  process.stdout.write(`Paragraphs: ${paras.length}\n`);
  process.stdout.write(`Pairs: ${pairs.length}\n`);
  process.stdout.write(`OUT: ${OUT}\n`);
  process.stdout.write(`Sample:\n  RU: ${pairs[0]?.ru}\n  ING: ${pairs[0]?.ing}\n`);
  process.stdout.write(`Tail:\n  RU: ${pairs.at(-1)?.ru}\n  ING: ${pairs.at(-1)?.ing}\n`);
}

main();
