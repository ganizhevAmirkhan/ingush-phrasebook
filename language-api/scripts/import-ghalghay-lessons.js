/**
 * Import ghalghay.com school lessons (уроки 1–37) into corpus + Habar conversation.
 * Source: https://ghalghay.com/category/ингушский-язык/
 * Skips lessons already present in language-api/data/corpus/stories/.
 *
 * Usage: node scripts/import-ghalghay-lessons.js [--dry-run] [--from=1] [--to=37]
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { splitRuIngPairs, isUsableShortRu } = require("../src/phrase-split");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const CORPUS_DIR = path.join(__dirname, "..", "data", "corpus", "stories");
const CATEGORY_URL =
  "https://ghalghay.com/category/%D0%B8%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/";

const FETCH_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
}

function stripHtml(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  return (s || "")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ingush-phrasebook-import/1.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function discoverLessonLinks(fromLesson, toLesson) {
  const found = new Map();
  for (let page = 1; page <= 6; page += 1) {
    const url = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}page/${page}/`;
    let html;
    try {
      html = await fetchText(url);
    } catch {
      break;
    }
    const re = /href="(https:\/\/ghalghay\.com\/\d{4}\/\d{2}\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const link = decodeEntities(m[1]).replace(/&amp;/g, "&");
      const decoded = decodeURIComponent(link);
      const numMatch = decoded.match(/урок[-\s]*(\d+)/i);
      if (!numMatch) continue;
      const n = Number(numMatch[1]);
      if (n < fromLesson || n > toLesson) continue;
      if (!found.has(n)) found.set(n, link);
    }
    await sleep(FETCH_DELAY_MS);
  }
  return found;
}

function extractPairsFromText(text) {
  const pairs = [];
  const seen = new Set();

  function push(ru, ing) {
    ru = (ru || "").replace(/\s+/g, " ").trim();
    ing = (ing || "").replace(/\s+/g, " ").trim();
    if (!isUsableShortRu(ru) || !ing || ing.length > 220) return;
    if (!/[A-ZА-ЯI1Әӏ]/.test(ing)) return;
    const key = norm(ru);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ ru, ing });
  }

  // RU — ING (em dash, en dash, hyphen with spaces)
  const dashRe = /([^.!?\n]{4,120}?)\s*[—–-]\s*([A-ZА-ЯI1][^.!?\n]{2,180})/g;
  let m;
  while ((m = dashRe.exec(text))) {
    push(m[1], m[2]);
  }

  // Vocabulary: Word-WORD or Word — WORD at line starts
  const vocabRe = /(?:^|[\n.])\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s]{1,40}?)\s*[—–-]\s*([A-ZА-ЯI1][A-ZА-ЯI1a-zа-яё\s]{1,50})/g;
  while ((m = vocabRe.exec(text))) {
    push(m[1], m[2]);
  }

  return pairs;
}

function lessonSlug(n, titleIng = "") {
  const base = titleIng
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base ? `ghalghay_lesson_${n}_${base}` : `ghalghay_lesson_${n}`;
}

async function existingLessonNumbers() {
  const nums = new Set();
  const files = await fs.readdir(CORPUS_DIR);
  for (const f of files) {
    const m = f.match(/lesson_(\d+)/i);
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

async function loadHabarKeys() {
  const keys = new Set();
  const files = (await fs.readdir(CATEGORIES_DIR)).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const data = JSON.parse(await fs.readFile(path.join(CATEGORIES_DIR, file), "utf8"));
    for (const it of data.items || []) {
      const k = norm(it.ru);
      if (k) keys.add(k);
    }
  }
  return keys;
}

function pronFromIng(ing) {
  return (ing || "").toLowerCase().replace(/[Ӏʺ]/g, "1").replace(/\s+/g, " ").trim();
}

function capitalizeRu(ru) {
  const t = (ru || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fromLesson = Number(args.find((a) => a.startsWith("--from="))?.slice(7) || 1);
  const toLesson = Number(args.find((a) => a.startsWith("--to="))?.slice(5) || 37);

  const have = await existingLessonNumbers();
  process.stdout.write(`Corpus lessons already: ${[...have].sort((a, b) => a - b).join(", ")}\n`);

  process.stdout.write(`Discovering lesson links ${fromLesson}–${toLesson}…\n`);
  const links = await discoverLessonLinks(fromLesson, toLesson);
  process.stdout.write(`Found ${links.size} lesson URL(s)\n`);

  const habarKeys = await loadHabarKeys();
  const convPath = path.join(CATEGORIES_DIR, "conversation.json");
  const conv = JSON.parse(await fs.readFile(convPath, "utf8"));
  let convAdded = 0;
  let corpusAdded = 0;

  for (let n = fromLesson; n <= toLesson; n += 1) {
    if (have.has(n)) {
      process.stdout.write(`Skip lesson ${n} — corpus exists\n`);
      continue;
    }
    const url = links.get(n);
    if (!url) {
      process.stdout.write(`Skip lesson ${n} — URL not found\n`);
      continue;
    }

    await sleep(FETCH_DELAY_MS);
    const html = await fetchText(url);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = stripHtml(titleMatch?.[1] || `Урок ${n}`);
    const ingTitleMatch = title.match(/\(([A-ZА-ЯI1][^)]+)\)/);
    const bodyMatch = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const bodyText = stripHtml(decodeEntities(bodyMatch?.[1] || html));
    const pairs = extractPairsFromText(bodyText);

    if (!pairs.length) {
      process.stdout.write(`Lesson ${n}: no pairs parsed from ${url}\n`);
      continue;
    }

    const slug = lessonSlug(n, ingTitleMatch?.[1] || "");
    const story = {
      id: `story_${slug}_001`,
      title: title.split("|")[0].trim(),
      level: "A1",
      genre: n >= 32 ? "lesson" : "dialogue",
      paragraphs: pairs.map((p) => ({ ru: p.ru, ing: p.ing })),
      source: url
    };

    const storyPath = path.join(CORPUS_DIR, `${slug}.json`);
    if (!dryRun) {
      await fs.writeFile(storyPath, `${JSON.stringify(story, null, 2)}\n`, "utf8");
    }
    corpusAdded += 1;
    process.stdout.write(`Lesson ${n}: corpus ${slug}.json — ${pairs.length} paragraph(s)\n`);

    for (const p of pairs) {
      const key = norm(p.ru);
      if (!key || habarKeys.has(key)) continue;
      habarKeys.add(key);
      const id = `ghalghay_l${n}_${key.slice(0, 20).replace(/\s+/g, "_")}`;
      conv.items.push({
        ru: capitalizeRu(p.ru),
        ing: p.ing,
        pron: pronFromIng(p.ing),
        id,
        audio: `${id}.mp3`
      });
      convAdded += 1;
    }
  }

  if (convAdded && !dryRun) {
    conv.version = (conv.version || 0) + 1;
    conv.itemCount = conv.items.length;
    await fs.writeFile(convPath, `${JSON.stringify(conv, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`\nCorpus files added: ${corpusAdded}\n`);
  process.stdout.write(`Habar conversation added: ${convAdded} (total ${conv.items.length})\n`);
  if (!dryRun && (corpusAdded || convAdded)) {
    process.stdout.write("Run: node scripts/sync-habar-to-grammar.js\n");
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
