/**
 * Import ghalghay.com school lessons (уроки 1–37) into corpus + Habar conversation.
 * Source: https://ghalghay.com/category/ингушский-язык/
 * Skips lessons already present in language-api/data/corpus/stories/.
 *
 * Usage: node scripts/import-ghalghay-lessons.js [--dry-run] [--force] [--from=1] [--to=37]
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { splitRuIngPairs, isUsableRu } = require("../src/phrase-split");

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

function stripSpeakerPrefix(ru) {
  return (ru || "").replace(/^[А-ЯЁ][а-яё]+:\s*/, "").trim();
}

function isLikelyIngushBlock(s) {
  const t = (s || "").trim();
  if (!t || t.length < 3) return false;
  const upper = (t.match(/[A-ZА-ЯЁI1ӏӀ]/g) || []).length;
  if (upper / t.length < 0.28) return false;
  if (/[а-яё]{10,}/.test(t) && !/[I1ӏӀ]/.test(t)) return false;
  return /[A-ZА-ЯЁ]/.test(t);
}

function splitRuIngLine(text) {
  const candidates = [];
  for (const match of text.matchAll(/\s+(?:—|–)\s+/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({
        ru: stripSpeakerPrefix(text.slice(0, match.index).trim()),
        ing: ing.trim()
      });
    }
  }
  for (const match of text.matchAll(/[.!?)]-\s*(?=[A-ZА-ЯЁ])/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({
        ru: stripSpeakerPrefix(text.slice(0, match.index + 1).trim()),
        ing: ing.trim()
      });
    }
  }
  for (const match of text.matchAll(/\s+-\s*(?=[A-ZА-ЯЁ])/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({
        ru: stripSpeakerPrefix(text.slice(0, match.index).trim()),
        ing: ing.trim()
      });
    }
  }
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function splitIngRuLine(text) {
  for (const match of text.matchAll(/\s+(?:—|–)\s+/g)) {
    const left = text.slice(0, match.index).trim();
    const right = text.slice(match.index + match[0].length).trim();
    if (isLikelyIngushBlock(left) && /[а-яё]{3,}/i.test(right) && !isLikelyIngushBlock(right)) {
      return { ru: cleanGrammarRu(right.split(/[.?!]/)[0]), ing: left };
    }
  }
  const hyphenQ = text.match(/^([A-ZА-ЯЁI1ӏ][^?]{2,90}\?)\s*-\s*([А-ЯЁа-яё][^.!?]{3,120})/);
  if (hyphenQ && isLikelyIngushBlock(hyphenQ[1])) {
    return { ru: cleanGrammarRu(hyphenQ[2]), ing: hyphenQ[1].trim() };
  }
  const vocab = text.match(/^([A-Za-zА-Яа-яЁёI1ӏ?.\s]+?)\s*-\s*([а-яёА-ЯЁ][а-яёА-ЯЁ\s]{1,50})$/);
  if (vocab && !/[а-яё]{8,}/i.test(vocab[1])) {
    return { ru: vocab[2].trim(), ing: vocab[1].trim() };
  }
  return null;
}

function splitDialogueLine(text) {
  return splitRuIngLine(text) || splitIngRuLine(text);
}

function cleanGrammarRu(ru) {
  return stripSpeakerPrefix((ru || "").replace(/\s+/g, " ").replace(/^[-–—]\s*/, "").trim());
}

function extractGrammarPairsFromText(text) {
  const pairs = [];
  const seen = new Set();

  function tryPush(ru, ing) {
    ru = cleanGrammarRu(ru);
    ing = (ing || "").replace(/\s+/g, " ").trim();
    if (!ru || !ing) return;
    const subpairs = splitRuIngPairs(ru, ing, { maxRuLen: 180, maxRuWords: 24 });
    const chunks = subpairs.length ? subpairs : [{ ru, ing }];
    for (const chunk of chunks) {
      const r = (chunk.ru || "").trim();
      const i = (chunk.ing || "").trim();
      if (!isUsableRu(r, { maxRuLen: 180, maxRuWords: 24 }) || !i) continue;
      if (!/[A-ZА-ЯI1ӘӏӀ]/.test(i)) continue;
      const key = norm(r);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pairs.push({ ru: r, ing: i });
    }
  }

  const dashRe =
    /([^—–]{3,140}?)\s*(?:—|–)\s*([^—–]{3,140}?)(?=\s+[А-ЯЁA-ZI1ӏ]|$|[.;])/g;
  let m;
  while ((m = dashRe.exec(text))) {
    const a = m[1].trim();
    const b = m[2].trim();
    if (isLikelyIngushBlock(b) && /[а-яё]{3,}/i.test(a) && !isLikelyIngushBlock(a)) {
      tryPush(a, b);
    } else if (isLikelyIngushBlock(a) && /[а-яё]{3,}/i.test(b) && !isLikelyIngushBlock(b)) {
      tryPush(b, a);
    } else if (!isLikelyIngushBlock(a) && isLikelyIngushBlock(b)) {
      tryPush(a, b);
    }
  }

  const hyphenRe =
    /([A-ZА-ЯЁI1ӏ][A-ZА-ЯЁI1ӏa-zа-яё\s,?]{2,90}\?)\s*-\s*([А-ЯЁ][^.!?]{4,140})/g;
  while ((m = hyphenRe.exec(text))) {
    tryPush(m[2], m[1]);
  }

  const answerRe =
    /([А-ЯЁ][^.!?]{4,120})\s*\.-\s*([A-ZА-ЯЁI1ӏ][^.!?]{4,140})/g;
  while ((m = answerRe.exec(text))) {
    tryPush(m[1], m[2]);
  }

  return pairs;
}

function paragraphToPlain(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPairsFromText(text, seen, pairs, pushPair) {
  const dashRe = /([^.!?\n]{4,120}?)\s*[—–-]\s*([A-ZА-ЯI1][^.!?\n]{2,180})/g;
  let m;
  while ((m = dashRe.exec(text))) {
    pushPair(m[1], m[2]);
  }
  const vocabRe =
    /(?:^|[\n.])\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s]{1,40}?)\s*[—–-]\s*([A-ZА-ЯI1][A-ZА-ЯI1a-zа-яё\s]{1,50})/g;
  while ((m = vocabRe.exec(text))) {
    pushPair(m[1], m[2]);
  }
}

function extractPairsFromLessonHtml(html) {
  const pairs = [];
  const seen = new Set();

  function pushPair(ru, ing) {
    ru = stripSpeakerPrefix((ru || "").replace(/\s+/g, " ").trim());
    ing = (ing || "").replace(/\s+/g, " ").trim();
    if (!ing || ing.length > 320) return;

    const subpairs = splitRuIngPairs(ru, ing, { maxRuLen: 180, maxRuWords: 24 });
    const chunks = subpairs.length ? subpairs : [{ ru, ing }];

    for (const chunk of chunks) {
      const r = (chunk.ru || "").trim();
      const i = (chunk.ing || "").trim();
      if (!isUsableRu(r, { maxRuLen: 180, maxRuWords: 24 }) || !i) continue;
      if (!/[A-ZА-ЯI1ӘӏӀ]/.test(i)) continue;
      const key = norm(r);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pairs.push({ ru: r, ing: i });
    }
  }

  const bodyMatch =
    html.match(/<div class="storycontent"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);

  if (bodyMatch) {
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRe.exec(bodyMatch[1]))) {
      const text = paragraphToPlain(m[1]);
      if (!text || /filed under|tags:/i.test(text)) continue;
      const split = splitDialogueLine(text);
      const grammarPairs =
        text.length > 60 && /(?:—|–|\?-|\s-\s)/.test(text)
          ? extractGrammarPairsFromText(text)
          : [];
      if (grammarPairs.length > 1) {
        for (const gp of grammarPairs) pushPair(gp.ru, gp.ing);
      } else if (split && text.length < 500) {
        pushPair(split.ru, split.ing);
      } else if (grammarPairs.length === 1) {
        pushPair(grammarPairs[0].ru, grammarPairs[0].ing);
      } else if (split) {
        pushPair(split.ru, split.ing);
      } else if (!/<strong/i.test(m[1])) {
        extractPairsFromText(text, seen, pairs, pushPair);
      }
    }
    if (pairs.length) return pairs;
  }

  const bodyText = stripHtml(decodeEntities(bodyMatch?.[1] || html));
  extractPairsFromText(bodyText, seen, pairs, pushPair);
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
  const force = args.includes("--force");
  const fromLesson = Number(args.find((a) => a.startsWith("--from="))?.slice(7) || 1);
  const toLesson = Number(args.find((a) => a.startsWith("--to="))?.slice(5) || 37);

  const have = force ? new Set() : await existingLessonNumbers();
  if (force) {
    process.stdout.write(`--force: re-import lessons ${fromLesson}–${toLesson}\n`);
  } else {
    process.stdout.write(`Corpus lessons already: ${[...have].sort((a, b) => a - b).join(", ")}\n`);
  }

  process.stdout.write(`Discovering lesson links ${fromLesson}–${toLesson}…\n`);
  const links = await discoverLessonLinks(fromLesson, toLesson);
  process.stdout.write(`Found ${links.size} lesson URL(s)\n`);

  const habarKeys = await loadHabarKeys();
  const convPath = path.join(CATEGORIES_DIR, "conversation.json");
  const conv = JSON.parse(await fs.readFile(convPath, "utf8"));
  let convAdded = 0;
  let corpusAdded = 0;

  for (let n = fromLesson; n <= toLesson; n += 1) {
    if (!force && have.has(n)) {
      process.stdout.write(`Skip lesson ${n} — corpus exists\n`);
      continue;
    }
    if (force) {
      const stale = (await fs.readdir(CORPUS_DIR)).filter((f) => {
        const m = f.match(/lesson_(\d+)/i);
        return m && Number(m[1]) === n && f.endsWith(".json");
      });
      for (const f of stale) {
        if (!dryRun) await fs.unlink(path.join(CORPUS_DIR, f));
        process.stdout.write(`Removed stale corpus file: ${f}\n`);
      }
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
    const pairs = extractPairsFromLessonHtml(html);

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
