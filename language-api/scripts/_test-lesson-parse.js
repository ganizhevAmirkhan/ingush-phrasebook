const { isUsableShortRu } = require("../src/phrase-split");

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

function extractPairsFromText(text) {
  const pairs = [];
  const seen = new Set();
  function push(ru, ing) {
    ru = (ru || "").replace(/\s+/g, " ").trim();
    ing = (ing || "").replace(/\s+/g, " ").trim();
    if (!isUsableShortRu(ru) || !ing || ing.length > 220) return;
    if (!/[A-ZА-ЯI1Әӏ]/.test(ing)) return;
    const key = ru.toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ ru, ing });
  }
  const dashRe = /([^.!?\n]{4,120}?)\s*[—–-]\s*([A-ZА-ЯI1][^.!?\n]{2,180})/g;
  let m;
  while ((m = dashRe.exec(text))) push(m[1], m[2]);
  const vocabRe =
    /(?:^|[\n.])\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s]{1,40}?)\s*[—–-]\s*([A-ZА-ЯI1][A-ZА-ЯI1a-zа-яё\s]{1,50})/g;
  while ((m = vocabRe.exec(text))) push(m[1], m[2]);
  return pairs;
}

async function main() {
  const CATEGORY_URL =
    "https://ghalghay.com/category/%D0%B8%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/";
  const lessons = new Map();
  for (let page = 1; page <= 6; page += 1) {
    const url = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}page/${page}/`;
    const res = await fetch(url, { headers: { "User-Agent": "test" } });
    if (!res.ok) break;
    const html = await res.text();
    const re = /href="(https:\/\/ghalghay\.com\/\d{4}\/\d{2}\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const link = m[1];
      const dec = decodeURIComponent(link);
      const nm = dec.match(/урок[-\s]*(\d+)/i);
      if (!nm) continue;
      const n = Number(nm[1]);
      if (n >= 26 && n <= 37 && !lessons.has(n)) lessons.set(n, link);
    }
  }
  console.log("Found:", [...lessons.keys()].sort((a, b) => a - b).join(", "));
  for (const [n, link] of [...lessons.entries()].sort((a, b) => a[0] - b[0])) {
    await new Promise((r) => setTimeout(r, 600));
    const h = await fetch(link, { headers: { "User-Agent": "test" } });
    const html = await h.text();
    const body = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
    const text = stripHtml(decodeEntities(body?.[1] || ""));
    const pairs = extractPairsFromText(text);
    console.log(`Lesson ${n}: ${pairs.length} pairs`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
