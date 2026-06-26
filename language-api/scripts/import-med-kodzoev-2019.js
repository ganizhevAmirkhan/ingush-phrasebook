/**
 * Import «Медицина. Русско-ингушский словарь» (Кодзоев Н.Д., КЕП, 2019).
 *
 * Usage:
 *   node scripts/import-med-kodzoev-2019.js --pdf="C:/path/Медицина_....pdf"
 *   node scripts/import-med-kodzoev-2019.js --text="data/external/med-kodzoev-2019/extracted.txt"
 *   node scripts/import-med-kodzoev-2019.js --from-ingcorpora
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "data", "dictionary", "med-kodzoev-2019.json");
const DEFAULT_PDF = path.join(ROOT, "data", "external", "med-kodzoev-2019", "source.pdf");
const DEFAULT_TEXT = path.join(ROOT, "data", "external", "med-kodzoev-2019", "extracted.txt");
const INCORPORA_DATA = path.join(ROOT, "data", "external", "ghalghay", "ingcorpora", "src", "data.js");

const ENTRY_SPLIT = /\s+[–—−-]\s+/;

function parseArgs(argv) {
  const out = { pdf: "", text: "", fromIncorpora: false, writeText: false };
  for (const arg of argv) {
    if (arg.startsWith("--pdf=")) out.pdf = arg.slice("--pdf=".length);
    else if (arg.startsWith("--text=")) out.text = arg.slice("--text=".length);
    else if (arg === "--from-ingcorpora") out.fromIncorpora = true;
    else if (arg === "--write-text") out.writeText = true;
  }
  return out;
}

function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRuMeta(ru) {
  return ru
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripIngMorph(ing) {
  let s = ing.trim();
  s = s.split("//")[0].trim();
  while (/\([^)]*\)\s*$/.test(s)) {
    s = s.replace(/\([^)]*\)\s*$/, "").trim();
  }
  s = s.replace(/\|\|/g, "").replace(/~/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeRuKey(ru) {
  return ru
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseRu(ru) {
  const t = ru.trim();
  if (!t || t.length < 2) return true;
  if (/^(русский|сокращения|обозначения|буквы|названия|отвественный|кодзоев|©|удк|ббк|isbn|ооо|назрань|формат|мед\.|анат\.|биол\.|физиол\.|прил\.|сущ\.|нареч\.|прич\.)\b/i.test(t)) {
    return true;
  }
  if (/кодзоев|дошлорг|ингушск|словарь|назрань|нейрохирург|ооо|кеп|издатель|ббк|удк/i.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^[А-ЯЁ]\s*$/.test(t)) return true;
  if (/^[А-ЯЁ]\.\s*[А-ЯЁ]\.?/.test(t)) return true;
  if (/глгIай|эрсий|нальчик|москва|м\.,|с\.|изд/i.test(t)) return true;
  return false;
}

function looksIngush(ing) {
  const t = ing.trim();
  if (!t || t.length < 2) return false;
  if (/ингушск|словарь|назрань|включено|предназначен/i.test(t)) return false;
  if (/[IӀ1]/.test(t)) return true;
  if (/[áéíóúÁÉÍÓÚ]/.test(t)) return true;
  if (/\|\|/.test(t)) return true;
  if (/\(-[а-яa-z]+\)/i.test(t)) return true;
  if (/\([бдйв],\s*[бдйв]?\)/i.test(t)) return true;
  if (/[ъьӀ]/.test(t)) return true;
  if (/гI|ГI|гӀ|ГӀ/.test(t)) return true;
  if (/^[а-яА-ЯёЁӀI1áéíóú\-]{4,}$/i.test(t)) return true;
  return false;
}

function isValidEntry(ru, ing) {
  if (isNoiseRu(ru)) return false;
  if (!ing || ing.length < 2 || ing.length > 120) return false;
  if (!looksIngush(ing)) return false;
  if (!/[а-яА-ЯёЁa-zA-Z]/.test(ru)) return false;
  if (ru.length > 90) return false;
  if (/^\d+\.\s/.test(ru)) return false;
  return true;
}

function findDictionaryStart(text) {
  const markers = [
    /\nаборт\s*[–—−-]/i,
    /\nагония\s*[–—−-]/i,
    /\nаорта\s*\(/i
  ];
  for (const re of markers) {
    const m = text.match(re);
    if (m?.index != null) return m.index;
  }
  return 0;
}

function parseDictionaryText(rawText) {
  const text = rawText.replace(/\r/g, "");
  const slice = text.slice(findDictionaryStart(text));
  const items = [];
  const seen = new Set();

  const re = /([а-яА-ЯёЁ][а-яА-ЯёЁ0-9\s\/,'«».\-]+?)\s*[–—−-]\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const ruPart = m[1].replace(/\s+/g, " ").trim();
    const ingPart = m[2].replace(/\s+/g, " ").trim();

    const ruVariants = splitVariants(ruPart);
    const ingVariants = splitVariants(ingPart);
    const tags = extractTags(ruPart, ingPart);

    for (const ru of ruVariants) {
      for (const ing of ingVariants) {
        pushItem(items, seen, { ru, ing, ruFull: ruPart, ingFull: ingPart, tags });
      }
    }
  }

  return items;
}

function splitVariants(part) {
  return part
    .split("//")
    .map((x) => x.trim())
    .filter(Boolean);
}

function pushItem(items, seen, { ru, ing, ruFull, ingFull, tags }) {
  const ruClean = stripRuMeta(ru);
  const ingHead = stripIngMorph(ing);
  if (!isValidEntry(ruClean, ingHead)) return;
  const key = `${normalizeRuKey(ruClean)}|${ingHead.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({
    id: `med19_${items.length + 1}`,
    ru: ruClean,
    ing: ingHead,
    ruFull: ruFull || ruClean,
    ingFull: ingFull || ing,
    tags: tags?.length ? tags : undefined,
    source: "med_kodzoev_2019",
    confidence: 0.86
  });
}

function extractTags(ru, ing) {
  const blob = `${ru} ${ing}`.toLowerCase();
  const tags = [];
  if (/\(анат\)|анат\./i.test(blob)) tags.push("anatomy");
  if (/\(физиол\)|физиол\./i.test(blob)) tags.push("physiology");
  if (/\(мед\)|мед\./i.test(blob)) tags.push("clinical");
  if (/молх|лекар|дарб|лор\b|аптек/i.test(blob)) tags.push("treatment");
  if (/цiий|цIий|кров/i.test(blob)) tags.push("blood");
  return tags;
}

function extractTermsFromHtml(html) {
  const terms = [];
  const chunks = (html || "").split(/<li>/i);
  for (const chunk of chunks) {
    const m = chunk.match(/<b>([^<]+)<\/b>/i);
    if (!m) continue;
    let term = m[1].trim();
    const tail = stripHtml(chunk.replace(/<b>[^<]+<\/b>/i, ""));
    if (tail) term = `${term} ${tail}`.trim();
    terms.push(term);
  }
  if (!terms.length) {
    const plain = stripHtml(html);
    if (plain) terms.push(plain);
  }
  return terms;
}

async function parseFromIncorpora() {
  const raw = await fs.readFile(INCORPORA_DATA, "utf8");
  const items = [];
  const seen = new Set();

  for (const line of raw.split("\n")) {
    if (!line.includes("<med19>")) continue;
    let row;
    try {
      row = JSON.parse(line.replace(/,\s*$/, ""));
    } catch {
      continue;
    }
    const ruParts = extractTermsFromHtml(row.d || "");
    const ingParts = extractTermsFromHtml(row.b || "");
    if (!ruParts.length || !ingParts.length) continue;
    for (const ru of ruParts) {
      for (const ing of ingParts) {
        pushItem(items, seen, {
          ru,
          ing,
          ruFull: ru,
          ingFull: ing,
          tags: extractTags(ru, ing)
        });
      }
    }
  }

  return items;
}

async function extractPdfText(pdfPath) {
  const pdfParse = require("pdf-parse");
  const buf = await fs.readFile(pdfPath);
  const data = await pdfParse(buf);
  return data.text || "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let items = [];
  let sourceNote = "";

  if (args.fromIncorpora) {
    process.stdout.write("Parsing med19 from ingcorpora data.js…\n");
    items = await parseFromIncorpora();
    sourceNote = "ingcorpora/med19";
  } else {
    process.stdout.write("Parsing med19 from ingcorpora + PDF text…\n");
    items = await parseFromIncorpora();
    sourceNote = "ingcorpora/med19";
    let rawText = "";
    const textPath = args.text ? path.resolve(args.text) : DEFAULT_TEXT;
    const pdfPath = args.pdf ? path.resolve(args.pdf) : DEFAULT_PDF;

    if (!rawText) {
      try {
        rawText = await fs.readFile(textPath, "utf8");
        sourceNote = `${sourceNote} + ${textPath}`;
      } catch {
        try {
          await fs.access(pdfPath);
          rawText = await extractPdfText(pdfPath);
          sourceNote = `${sourceNote} + ${pdfPath}`;
        } catch {
          const downloads = "c:/Users/admin/Downloads";
          try {
            const entries = await fs.readdir(downloads);
            for (const n of entries) {
              if (!n.endsWith(".pdf")) continue;
              const st = await fs.stat(path.join(downloads, n));
              if (st.size === 419179) {
                rawText = await extractPdfText(path.join(downloads, n));
                sourceNote = `${sourceNote} + ${path.join(downloads, n)}`;
                break;
              }
            }
          } catch {
            // ignore
          }
        }
      }
      if (rawText && args.writeText) {
        await fs.mkdir(path.dirname(DEFAULT_TEXT), { recursive: true });
        await fs.writeFile(DEFAULT_TEXT, rawText, "utf8");
        process.stdout.write(`Wrote ${DEFAULT_TEXT}\n`);
      }
    } else {
      sourceNote = `${sourceNote} + ${textPath}`;
    }

    if (rawText) {
      const seen = new Set(items.map((x) => `${normalizeRuKey(x.ru)}|${x.ing.toLowerCase()}`));
      for (const it of parseDictionaryText(rawText)) {
        const key = `${normalizeRuKey(it.ru)}|${it.ing.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(it);
      }
    }
  }

  const payload = {
    title: "Медицина. Русско-ингушский словарь (2019)",
    authors: "Кодзоев Н.Д.",
    publisher: "ООО «КЕП», Назрань",
    source: "med_kodzoev_2019",
    sourceRef: "ingcorpora:med19",
    parsedFrom: sourceNote,
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    items
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const byTag = {};
  for (const it of items) {
    for (const tag of it.tags || ["general"]) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        out: OUT_FILE,
        items: items.length,
        byTag,
        sample: items.slice(0, 8).map((x) => ({ ru: x.ru, ing: x.ing }))
      },
      null,
      2
    )}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
