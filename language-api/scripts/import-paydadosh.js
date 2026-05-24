const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "colloquial");
const PHRASES_OUT = path.join(OUT_DIR, "paydadosh-phrases.json");
const SUMMARY_OUT = path.join(OUT_DIR, "paydadosh-import-summary.json");
const FAILURES_OUT = path.join(OUT_DIR, "paydadosh-import-failures.json");
const SNAPSHOT_HTML = path.join(ROOT, "data", "external", "paydadosh", "phrasebook.html");

const SITEMAP_PHRASE_PAGES = Number(process.env.PD_SITEMAP_PHRASE_PAGES || 12);
const SITEMAP_PROVERB_PAGES = Number(process.env.PD_SITEMAP_PROVERB_PAGES || 6);
const CONCURRENCY = Number(process.env.PD_IMPORT_CONCURRENCY || 1);
const FETCH_DELAY_MS = Number(process.env.PD_IMPORT_DELAY_MS || 450);
const MAX_RETRIES = Number(process.env.PD_IMPORT_RETRIES || 6);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CATEGORY_BLOCKLIST = new Set([
  "повседневные фразы",
  "этикет и традиции",
  "пожелания и поздравления",
  "уроки разговорника",
  "устойчивые выражения",
  "религиозные фразы",
  "традиции",
  "хранители",
  "живи"
]);

function decodeHtmlEntities(value) {
  return (value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtmlEntities((value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function normalizeRu(value) {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRuQuote(value) {
  return (value || "")
    .replace(/^[«"'\s.]+|[»"'\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIngRuPair(text) {
  const clean = stripTags(text).replace(/\s*\|\s*PaydaDosh\s*$/i, "");
  const parts = clean.split(/\s+[—–-]\s+/);
  if (parts.length < 2) return null;
  return {
    ing: parts[0].trim(),
    ru: parts.slice(1).join(" — ").trim()
  };
}

function pickRussianQuote(quotes) {
  for (const raw of quotes) {
    const candidate = cleanRuQuote(raw);
    if (!candidate || candidate.length < 2) continue;
    if (!/[А-Яа-яЁё]/.test(candidate)) continue;
    if (CATEGORY_BLOCKLIST.has(normalizeRu(candidate))) continue;
    if (candidate.length > 180) continue;
    return candidate;
  }
  return "";
}

function ingFromSlug(slug) {
  const tail = slug.replace(/^\d+-/, "").replace(/-/g, " ");
  return decodeURIComponent(tail).trim();
}

function parsePhrasePage(html, url) {
  const slug = url.split("/").pop() || "";
  const idMatch = slug.match(/^(\d+)-/);
  const id = idMatch ? `pd_${idMatch[1]}` : `pd_${slug.slice(0, 40)}`;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const copyMatch = html.match(/data-copy="([^"]+)"/i);
  const ingFromH1 = stripTags(h1Match?.[1] || copyMatch?.[1] || "");

  const metaPair = splitIngRuPair(
    html.match(/name="description"\s+content="([^"]+)"/i)?.[1] || ""
  );
  const ogPair = splitIngRuPair(
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] || ""
  );

  let ing = ingFromH1 || metaPair?.ing || ogPair?.ing || "";
  let ru = "";

  if (metaPair?.ru) {
    ru = metaPair.ru.split(/\.\s+/)[0].trim();
  }
  if (!ru && ogPair?.ru) {
    ru = ogPair.ru.split(/\.\s+/)[0].trim();
  }
  if (!ru) {
    const ruQuotes = [...html.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    ru = pickRussianQuote(ruQuotes);
  }

  if (!ing && metaPair?.ing) ing = metaPair.ing;
  if (!ing && ogPair?.ing) ing = ogPair.ing;
  if (!ing || !ru) return null;

  ru = cleanRuQuote(ru.replace(/\s*\([^)]{40,}\)\s*$/g, "").trim());
  if (!ru || ru === "-" || !/[а-яё]/i.test(ru)) return null;

  const categoryMatch = html.match(/phrasebook\?category=([^"'&]+)/i);
  const category = categoryMatch ? categoryMatch[1] : "unknown";

  const sourceMatch = html.match(/источник:\s*<[^>]*>([^<]+)</i);
  const sourceLabel = stripTags(sourceMatch?.[1] || "PaydaDosh");

  return {
    id,
    slug,
    ru,
    ruNorm: normalizeRu(ru),
    ing,
    category,
    source: "paydadosh",
    sourceLabel,
    url,
    confidence: category.startsWith("lesson_") ? 0.98 : 0.93
  };
}

function parseProverbPage(html, url) {
  const slug = url.split("/").pop() || "";
  const idMatch = slug.match(/^(\d+)-/);
  const id = idMatch ? `pd_prov_${idMatch[1]}` : `pd_prov_${slug.slice(0, 40)}`;

  const titleRaw = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
  const titlePair = splitIngRuPair(titleRaw.replace(/\s*ингушская пословица.*/i, ""));
  const desc = stripTags(html.match(/name="description"\s+content="([^"]+)"/i)?.[1] || "");

  let ing = titlePair?.ing || "";
  if (!ing) {
    ing = stripTags(titleRaw.split(/\s+[—–-]\s+/)[0] || "");
  }
  if (!ing) ing = ingFromSlug(slug);

  let ru = desc;
  if (!ru) {
    const ruQuotes = [...html.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    ru = pickRussianQuote(ruQuotes);
  }

  if (!ing || !ru) return null;

  ru = cleanRuQuote(ru);
  if (!ru || ru === "-" || !/[а-яё]/i.test(ru)) return null;

  return {
    id,
    slug,
    ru,
    ruNorm: normalizeRu(ru),
    ing,
    category: "proverb",
    source: "paydadosh",
    sourceLabel: "PaydaDosh proverb",
    url,
    confidence: 0.85
  };
}

function parsePhrasebookSnapshot(html) {
  const rows = [...html.matchAll(/<div class="pd-row with-actions">([\s\S]*?)<\/div>\s*<div class="pd-row-actions/gi)];
  const out = [];
  for (const row of rows) {
    const chunk = row[1];
    const ingLink = chunk.match(/href="(\/phrase\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const ruMatch = chunk.match(/italic text-paper-600[^>]*>\s*«([^»]+)»/i);
    const copyMatch = chunk.match(/data-copy="([^"]+)"/i);
    const categoryMatch = chunk.match(/урок\/раздел[^>]*>([^<]+)</i);
    if (!ruMatch && !copyMatch) continue;

    const ing = stripTags(ingLink?.[2] || copyMatch?.[1] || "");
    const ru = cleanRuQuote(ruMatch?.[1] || "");
    if (!ing || !ru) continue;

    const slug = (ingLink?.[1] || "").replace("/phrase/", "");
    const idMatch = slug.match(/^(\d+)-/);
    out.push({
      id: idMatch ? `pd_${idMatch[1]}` : `pd_snap_${out.length + 1}`,
      slug,
      ru,
      ruNorm: normalizeRu(ru),
      ing,
      category: categoryMatch ? categoryMatch[1].trim() : "snapshot",
      source: "paydadosh",
      sourceLabel: "PaydaDosh snapshot",
      url: slug ? `https://paydadosh.ru/phrase/${slug}` : "",
      confidence: 0.9
    });
  }
  return out;
}

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "ingush-phrasebook-import/1.0 (+language-api)",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (res.status === 429 || res.status === 503) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`HTTP ${res.status} for ${url} after ${MAX_RETRIES} retries`);
    }
    const waitMs = Math.min(30000, 800 * 2 ** attempt);
    await sleep(waitMs);
    return fetchText(url, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function loadSitemapUrls(basePath, pages) {
  const urls = new Set();
  for (let page = 1; page <= pages; page += 1) {
    try {
      const xml = await fetchText(`https://paydadosh.ru/${basePath}/${page}.xml`);
      for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        urls.add(match[1]);
      }
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
  }
  return [...urls];
}

async function mapPool(items, worker, limit) {
  const out = [];
  let index = 0;
  let done = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      const url = items[current];
      try {
        const html = await fetchText(url);
        const value = await worker(html, url);
        if (value) out.push(value);
        else out.push({ skipped: true, url });
      } catch (err) {
        out.push({ error: String(err?.message || err), url });
      }
      done += 1;
      if (done % 100 === 0 || done === items.length) {
        const ok = out.filter((x) => x && !x.error && !x.skipped).length;
        const skipped = out.filter((x) => x?.skipped).length;
        const errors = out.filter((x) => x?.error).length;
        console.log(`  progress ${done}/${items.length} | parsed ${ok} | skipped ${skipped} | errors ${errors}`);
      }
      if (FETCH_DELAY_MS > 0) await sleep(FETCH_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return out;
}

function dedupePhrases(items) {
  const byRu = new Map();
  for (const item of items) {
    if (!item?.ruNorm || !item?.ing || item.error || item.skipped) continue;
    const prev = byRu.get(item.ruNorm);
    if (!prev || (item.confidence || 0) > (prev.confidence || 0)) {
      byRu.set(item.ruNorm, item);
    }
  }
  return [...byRu.values()].sort((a, b) => a.ru.localeCompare(b.ru, "ru"));
}

async function importUrls(urls, parser, label) {
  if (!urls.length) return { parsed: [], skipped: 0, errors: [], failures: [] };
  console.log(`Fetching ${urls.length} PaydaDosh ${label} pages (concurrency=${CONCURRENCY}, delay=${FETCH_DELAY_MS}ms)...`);
  const raw = await mapPool(urls, (html, url) => parser(html, url), CONCURRENCY);
  const parsed = raw.filter((x) => x && !x.error && !x.skipped);
  const skipped = raw.filter((x) => x?.skipped).length;
  const errors = raw.filter((x) => x?.error);
  if (errors.length) {
    console.warn(`  ${label} fetch errors: ${errors.length}`);
  }
  if (skipped) {
    console.warn(`  ${label} parse skipped: ${skipped}`);
  }
  return { parsed, skipped, errors, failures: errors.map((x) => x.url) };
}

async function writePayload(items, extra = {}) {
  const merged = dedupePhrases(items);
  const payload = {
    version: 1,
    importedAt: new Date().toISOString(),
    source: "paydadosh.ru",
    count: merged.length,
    categories: [...new Set(merged.map((x) => x.category))].sort(),
    items: merged,
    ...extra
  };
  await fs.writeFile(PHRASES_OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { merged, payload };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const snapshotOnly = args.has("--snapshot-only");
  const phrasesOnly = args.has("--phrases-only");
  const proverbsOnly = args.has("--proverbs-only");
  const withProverbs = proverbsOnly || (args.has("--with-proverbs") || (!phrasesOnly && !snapshotOnly));
  const limit = Number(process.env.PD_IMPORT_LIMIT || 0);

  await fs.mkdir(OUT_DIR, { recursive: true });

  let snapshot = [];
  try {
    const html = await fs.readFile(SNAPSHOT_HTML, "utf8");
    snapshot = parsePhrasebookSnapshot(html);
  } catch {
    snapshot = [];
  }

  let existing = [];
  if (proverbsOnly) {
    try {
      const json = await fs.readFile(PHRASES_OUT, "utf8").then(JSON.parse);
      existing = Array.isArray(json?.items) ? json.items : [];
      console.log(`Loaded ${existing.length} existing phrases for proverb merge`);
    } catch {
      existing = [];
    }
  }

  let phraseResult = { parsed: [], skipped: 0, errors: [], failures: [] };
  let proverbResult = { parsed: [], skipped: 0, errors: [], failures: [] };

  if (!snapshotOnly && !proverbsOnly) {
    const phraseUrls = await loadSitemapUrls("sitemap-phrases", SITEMAP_PHRASE_PAGES);
    const targetPhraseUrls = limit > 0 ? phraseUrls.slice(0, limit) : phraseUrls;
    phraseResult = await importUrls(targetPhraseUrls, parsePhrasePage, "phrase");

    const { merged } = await writePayload([...snapshot, ...phraseResult.parsed], { phase: "phrases" });
    console.log(`Checkpoint: ${merged.length} phrases saved after phrase import`);
  }

  if (!snapshotOnly && withProverbs) {
    const proverbUrls = await loadSitemapUrls("sitemap-proverbs", SITEMAP_PROVERB_PAGES);
    const targetProverbUrls = limit > 0 ? proverbUrls.slice(0, limit) : proverbUrls;
    proverbResult = await importUrls(targetProverbUrls, parseProverbPage, "proverb");
  }

  const baseItems = proverbsOnly
    ? existing
    : snapshotOnly
      ? snapshot
      : [...snapshot, ...phraseResult.parsed];
  const fetched = [...baseItems, ...proverbResult.parsed];
  const { merged, payload } = await writePayload(fetched, { phase: "complete" });
  await fs.writeFile(
    SUMMARY_OUT,
    `${JSON.stringify(
      {
        importedAt: payload.importedAt,
        total: merged.length,
        snapshot: snapshot.length,
        phrasesFetched: phraseResult.parsed.length,
        proverbsFetched: proverbResult.parsed.length,
        phraseErrors: phraseResult.errors.length,
        proverbErrors: proverbResult.errors.length,
        phraseSkipped: phraseResult.skipped,
        proverbSkipped: proverbResult.skipped,
        categories: payload.categories.length,
        sample: merged.slice(0, 5)
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const allFailures = [...phraseResult.failures, ...proverbResult.failures];
  if (allFailures.length) {
    await fs.writeFile(FAILURES_OUT, `${JSON.stringify(allFailures, null, 2)}\n`, "utf8");
  }

  console.log(`Saved ${merged.length} phrases -> ${PHRASES_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
