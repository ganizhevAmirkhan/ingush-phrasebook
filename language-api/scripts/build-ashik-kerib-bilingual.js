/**
 * «Ашик-Кериб» — фразы RU + ING (короткие пары, не абзацы).
 *
 *   node scripts/ocr-ashik-ing-pages.js --force   # сначала, если нужен свежий OCR
 *   node scripts/build-ashik-kerib-bilingual.js
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const pdfParse = require("pdf-parse");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "external", "ashik-kerib");
const RU_PDF = "C:/Users/admin/Downloads/М_Ю_Лермонтов_Ашик_Кериб.pdf";
const ING_PAGES = path.join(OUT_DIR, "ing-ocr", "pages");

const MAX_WORDS = 24;
const MAX_LEN = 200;

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function dehyphenateLines(text) {
  const lines = (text || "").split("\n");
  const out = [];
  let buf = "";
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (/^\d{1,2}(\s+\d{1,2})?$/.test(line)) continue;
    if (buf.endsWith("-")) {
      buf = buf.slice(0, -1) + line;
      continue;
    }
    if (buf) out.push(buf);
    buf = line;
  }
  if (buf) out.push(buf);
  return out.join(" ");
}

function cleanRuPdf(raw) {
  let t = (raw || "").replace(/\r/g, "");
  const start = t.search(/Турецкая сказка/i);
  if (start >= 0) t = t.slice(start);
  const end = t.search(/\n\s*ПРИМЕЧАНИЯ/i);
  if (end >= 0) t = t.slice(0, end);
  t = t.replace(/([а-яёА-ЯЁ,.;:!?»])\s*\n\s*(\d{1,2})\s*\n\s*/g, "$1 ");
  t = t.replace(/\n\s*(\d{1,2})\s*\n\s*([А-ЯЁ«])/g, " $2");
  t = t.replace(/\n{2,}(\d{1,2})\n\s*[А-ЯЁ][^\n]{8,200}\n/g, "\n");
  t = t.replace(/Магуль-\s*Мегери/g, "Магуль-Мегери");
  t = t.replace(/Ашик-\s*Кериб/g, "Ашик-Кериб");
  return norm(t.replace(/^Турецкая сказка\s+/i, ""));
}

function splitChunks(text) {
  return norm(text)
    .split(/(?<=[.!?…;])\s+(?=[«А-ЯЁ])/)
    .map((s) => s.replace(/\s+\d{1,2}\s*$/g, "").trim())
    .filter((s) => s.length >= 6);
}

function shrinkLongPhrase(s) {
  const words = s.split(/\s+/);
  if (words.length <= MAX_WORDS && s.length <= MAX_LEN) return [s];
  const parts = s.split(/;\s+|(?<=[.!?…])\s+(?=[«А-ЯЁ])|,\s+(?=[«А-ЯЁ])/);
  const out = [];
  for (const p of parts) {
    const t = norm(p);
    if (!t || t.length < 6) continue;
    if (t.split(/\s+/).length > MAX_WORDS + 6) {
      const subs = t.split(/,\s+(?=[а-яё«А-ЯЁ])/);
      for (const sub of subs) {
        const u = norm(sub);
        if (u.length >= 8 && u.split(/\s+/).length <= MAX_WORDS + 4) out.push(u);
      }
    } else out.push(t);
  }
  return out.length ? out : [s];
}

function isRuNoise(s) {
  if (/^(Тифлиз|Аллах|Пророк|Ага|Хараф|Паша|Чауш|Георгий)\s*[-–—]/i.test(s)) return true;
  if (/означает:|город в Грузии|имя Бога|в которого верят/i.test(s)) return true;
  if (/встречается в (армянском|грузинском)/i.test(s)) return true;
  if (/^Смешение Хадерилиаза/i.test(s)) return true;
  if (/^\(св\.?\s*$/i.test(s) || /^Георгий\)\s*\d*/i.test(s)) return true;
  if (/^\d{1,2}\s*\.?\s*$/.test(s)) return true;
  if (s.split(/\s+/).length < 2) return true;
  return false;
}

function extractRuPhrases(text) {
  const phrases = [];
  for (const chunk of splitChunks(text)) {
    for (const p of shrinkLongPhrase(chunk)) {
      if (!isRuNoise(p) && /[а-яё]{4,}/i.test(p)) phrases.push(p);
    }
  }
  return phrases;
}

function isIngNoise(s) {
  if (/ИЗДАТЕЛЬ|НОХЧ|МЧЕЧЕНО|Лермонтов|Тираж|Типограф|Заказ|Подписано|Формат/i.test(s)) return true;
  if (/^[A-Za-z\\\/`]+$/.test(s)) return true;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (latin > s.length * 0.1) return true;
  return false;
}

function isIngPhrase(s) {
  const t = norm(s);
  if (t.length < 8 || t.length > MAX_LEN + 40) return false;
  if (isIngNoise(t)) return false;
  if (!/[а-яё]/i.test(t)) return false;
  const marks = (t.match(/[I1!]|г1|к1|х1|т1|п1|ц1|ч1|къ|хь|аьлар|г!|х!|т!|йо!/gi) || []).length;
  return marks >= 1 || /„|"|—/.test(t);
}

function splitIngChunks(body) {
  return body
    .split(
      /(?<=[.!?…])\s+(?=[„А-ЯЁI1ӏ])|(?<=[.!?…])—\s*(?=[„А-ЯЁ])|(?<=аьлар[^.!?]{0,40})\s+(?=[„А-ЯЁ])|(?<=»)\s*[-–—]\s*(?=[«А-ЯЁ„])/
    )
    .map((s) => norm(s.replace(/Лермонтова примечани[^.]*\./gi, " ").replace(/\*\)[^.]*\./g, " ")))
    .filter((s) => s.length >= 8);
}

function extractIngPhrasesFromPages(pagesDir) {
  const phrases = [];
  const files = fs
    .readdirSync(pagesDir)
    .filter((f) => /^page-\d+\.txt$/.test(f))
    .sort();
  for (const f of files) {
    const n = Number(f.match(/(\d+)/)[1]);
    if (n < 3 || n > 17) continue;
    const raw = fs.readFileSync(path.join(pagesDir, f), "utf8");
    const text = dehyphenateLines(raw);
    const start = text.search(/Дуккха ха хьалха|Н Дуккха/i);
    const body = start >= 0 ? text.slice(start) : text;
    for (const chunk of splitIngChunks(body)) {
      for (const p of shrinkLongPhrase(chunk)) {
        if (isIngPhrase(p)) phrases.push(p);
      }
    }
  }
  return phrases;
}

function alignSequential(ru, ing) {
  const n = Math.max(ru.length, ing.length);
  const pairs = [];
  for (let i = 0; i < n; i += 1) {
    if (!ru[i] && !ing[i]) continue;
    pairs.push({ ru: ru[i] || "", ing: ing[i] || "" });
  }
  return pairs.filter((p) => p.ru);
}

function buildHtml(title, pairs) {
  const esc = (s) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = pairs
    .map((p) => {
      const ing = p.ing
        ? `<p style="margin:0 0 18px 0;color:#004080;font-size:11pt;line-height:1.45">${esc(p.ing)}</p>`
        : `<p style="margin:0 0 18px 0;color:#999;font-size:10pt;line-height:1.45">&nbsp;</p>`;
      return (
        `<p style="margin:14px 0 4px 0;font-size:12pt;line-height:1.45">${esc(p.ru)}</p>${ing}`
      );
    })
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
<h2 style="text-align:center;font-family:Georgia,serif">${esc(title)}</h2>
<p style="text-align:center;color:#666;font-size:10pt">Формат: одна русская фраза → одна ингушская</p>
${rows}
</body></html>`;
}

function buildTsv(pairs) {
  return ["# RU\tING", ...pairs.map((p) => `${p.ru}\t${p.ing || ""}`)].join("\n");
}

async function copyDesktop(name, content) {
  const p = path.join(process.env.USERPROFILE || "", "Desktop", name);
  await fsp.writeFile(p, content, "utf8");
  process.stdout.write(`Desktop: ${p}\n`);
}

function buildIngOnlyHtml(title, phrases) {
  const esc = (s) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = phrases
    .map(
      (p, i) =>
        `<p style="margin:8px 0;font-size:11pt;line-height:1.45;color:#004080">${i + 1}. ${esc(p)}</p>`
    )
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
<h2 style="text-align:center">${esc(title)}</h2>
<p style="color:#666;font-size:10pt">Перевод С. Озиева (OCR). Сверяйте с книгой.</p>
${rows}
</body></html>`;
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  const ruPdf = await pdfParse(fs.readFileSync(RU_PDF));
  const ruPhrases = extractRuPhrases(cleanRuPdf(ruPdf.text));
  process.stdout.write(`RU phrases: ${ruPhrases.length}\n`);

  let ingPhrases = [];
  if (fs.existsSync(ING_PAGES)) {
    ingPhrases = extractIngPhrasesFromPages(ING_PAGES);
    process.stdout.write(`ING phrases: ${ingPhrases.length}\n`);
  }

  const pairs = alignSequential(ruPhrases, ingPhrases);
  const base = path.join(OUT_DIR, "Ашик-Кериб-фразы");
  const ruOnly = ruPhrases.map((ru) => ({ ru, ing: "" }));

  const htmlRu = "\uFEFF" + buildHtml("Ашик-Кериб — русские фразы", ruOnly);
  const htmlIng = "\uFEFF" + buildIngOnlyHtml("Ашик-Кериб — ингушские фразы (OCR)", ingPhrases);

  await fsp.writeFile(`${base}-ру.doc`, htmlRu, "utf8");
  await fsp.writeFile(`${base}-инг.doc`, htmlIng, "utf8");
  await fsp.writeFile(`${base}-таблица.txt`, buildTsv(pairs), "utf8");
  await fsp.writeFile(path.join(OUT_DIR, "ru-phrases.txt"), ruPhrases.join("\n"), "utf8");
  await fsp.writeFile(path.join(OUT_DIR, "ing-phrases.txt"), ingPhrases.join("\n"), "utf8");

  await copyDesktop("Ашик-Кериб-ру-фразы.doc", htmlRu);
  await copyDesktop("Ашик-Кериб-инг-фразы.doc", htmlIng);

  const docs = path.join(
    process.env.USERPROFILE || "",
    "Documents",
    "ОСР",
    "Г1алг1ай  лекции"
  );
  try {
    await fsp.writeFile(path.join(docs, "Ашик-Кериб-ру-фразы.doc"), htmlRu, "utf8");
    await fsp.writeFile(path.join(docs, "Ашик-Кериб-инг-фразы.doc"), htmlIng, "utf8");
  } catch {
    /* ignore */
  }

  process.stdout.write(`\nГотово: RU ${ruPhrases.length}, ING ${ingPhrases.length} фраз.\n`);
  process.stdout.write(`Открыть: Desktop\\Ашик-Кериб-ру-фразы.doc\n`);
  process.stdout.write(`Ингушский список: Desktop\\Ашик-Кериб-инг-фразы.doc\n`);
  process.stdout.write(`Таблица (черновик): ${base}-таблица.txt\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
