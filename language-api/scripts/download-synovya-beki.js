/**
 * Download RU + ING «Сыновья Беки» / «Iаи бIаьстии вIашагIкъасташ» sources.
 */
const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki");
fs.mkdirSync(OUT, { recursive: true });

function fetchBuf(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
          Accept: "*/*"
        },
        timeout: 60000
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 10) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          return fetchBuf(next, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks),
            ctype: (res.headers["content-type"] || "").toLowerCase(),
            url
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function looksPdf(buf, ctype) {
  return ctype.includes("pdf") || buf.slice(0, 5).toString() === "%PDF-";
}

function looksZip(buf) {
  return buf[0] === 0x50 && buf[1] === 0x4b;
}

function looksHtml(buf, ctype) {
  if (ctype.includes("html")) return true;
  const s = buf.slice(0, 200).toString("utf8").toLowerCase();
  return s.includes("<html") || s.includes("<!doctype");
}

async function trySave(url, outName) {
  process.stdout.write(`TRY ${url}\n`);
  try {
    const r = await fetchBuf(url);
    process.stdout.write(`  -> ${r.status} ${r.ctype} ${r.body.length}b\n`);
    if (r.status !== 200) return false;
    const out = path.join(OUT, outName);
    if (looksPdf(r.body, r.ctype)) {
      fs.writeFileSync(out.replace(/\.[^.]+$/, ".pdf"), r.body);
      process.stdout.write(`  SAVED PDF ${out.replace(/\.[^.]+$/, ".pdf")}\n`);
      return true;
    }
    if (looksZip(r.body) || outName.endsWith(".zip") || outName.endsWith(".fb2.zip")) {
      fs.writeFileSync(out.endsWith(".zip") ? out : out + ".zip", r.body);
      process.stdout.write(`  SAVED ZIP ${out}\n`);
      return true;
    }
    if (looksHtml(r.body, r.ctype)) {
      const html = r.body.toString("utf8");
      const pdfs = [
        ...html.matchAll(/https?:\/\/[^"'\\\s>]+\.pdf/gi),
        ...html.matchAll(/\/wp-content\/uploads\/[^"'\\\s>]+\.pdf/gi),
        ...html.matchAll(/href=["']([^"']+\.(?:fb2|epub|txt|zip|pdf)(?:\.zip)?)["']/gi)
      ].map((m) => (m[1] ? new URL(m[1], url).href : m[0].startsWith("http") ? m[0] : new URL(m[0], url).href));
      const uniq = [...new Set(pdfs)];
      process.stdout.write(`  html links: ${uniq.slice(0, 12).join(" | ")}\n`);
      fs.writeFileSync(path.join(OUT, `${outName}.html`), html.slice(0, 400000), "utf8");
      for (const link of uniq.slice(0, 8)) {
        if (await trySave(link, path.basename(decodeURIComponent(link.split("?")[0])) || outName)) return true;
      }
      return false;
    }
    // plain text / fb2
    fs.writeFileSync(out, r.body);
    process.stdout.write(`  SAVED RAW ${out}\n`);
    return true;
  } catch (e) {
    process.stdout.write(`  ERR ${e.message}\n`);
    return false;
  }
}

async function scrapeGroznycity() {
  const pages = [];
  for (let i = 1; i <= 120; i += 1) {
    const url =
      i === 1
        ? "http://www.groznycity.ru/library/prose/bokov/document4831.shtml"
        : `http://www.groznycity.ru/library/prose/bokov/document4831_${i}.shtml`;
    process.stdout.write(`GROZNY page ${i}…\n`);
    try {
      const r = await fetchBuf(url);
      if (r.status !== 200) {
        process.stdout.write(`  stop status=${r.status}\n`);
        break;
      }
      const html = r.body.toString("utf8");
      if (/не найдена|Not Found|404/i.test(html) && html.length < 2000) break;
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text.length < 200) break;
      pages.push(`\n\n===== PAGE ${i} =====\n\n${text}`);
      // safety: if next link missing and i>5, continue a bit
      if (i > 5 && !/следующая|document4831_/i.test(html)) {
        // keep going a few more
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
      break;
    }
  }
  if (!pages.length) return false;
  const out = path.join(OUT, "ru-synovya-beki-groznycity.txt");
  fs.writeFileSync(out, pages.join("\n"), "utf8");
  process.stdout.write(`SAVED ${out} pages=${pages.length} chars=${fs.statSync(out).size}\n`);
  return true;
}

async function main() {
  process.stdout.write(`OUT ${OUT}\n`);

  // Russian ebook mirrors
  const ruTries = [
    ["https://flibusta.is/b/220948/download?format=fb2", "ru-synovya-beki.fb2.zip"],
    ["https://flibusta.is/b/220948/download?format=txt", "ru-synovya-beki.txt"],
    ["https://flibusta.is/b/220948/download?format=epub", "ru-synovya-beki.epub"],
    ["https://flibusta.in/b/220948/download?format=fb2", "ru-synovya-beki.fb2.zip"],
    ["https://flibusta.in/b/220948/download?format=txt", "ru-synovya-beki.txt"],
    ["https://iknigi.net/avtor-ahmed-bokov/585-synovya-beki-ahmed-bokov.html", "iknigi-page"],
    ["https://bibling.ru/book/%d1%81%d1%8b%d0%bd%d0%be%d0%b2%d1%8c%d1%8f-%d0%b1%d0%b5%d0%ba%d0%b8/", "bibling-page"],
    ["https://dzurdzuki.com/download/bokov-a-h-synovya-beki-perevod-r-kafrielyants-1977/", "dzurdzuki-ru-page"]
  ];
  let ruOk = false;
  for (const [u, name] of ruTries) {
    if (await trySave(u, name)) {
      ruOk = true;
      break;
    }
  }
  if (!ruOk) {
    process.stdout.write("\nFallback: scrape groznycity HTML…\n");
    ruOk = await scrapeGroznycity();
  }

  // Ingush PDF
  process.stdout.write("\n=== ING ===\n");
  const ingTries = [
    ["https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/", "dzurdzuki-ing-page"],
    [
      "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Bokov-A.H.-Iai-bIastii-vIashagIkastash-1984.pdf",
      "ing-iai-biastii.pdf"
    ],
    [
      "https://dzurdzuki.com/wp-content/uploads/download-manager-files/bokov-a-h-iai-biastii-viashagikastash-1984.pdf",
      "ing-iai-biastii.pdf"
    ],
    ["https://archive.org/search.php?query=Iаи%20бIаьстии%20вIашагIкъасташ", "archive-search"],
    ["https://archive.org/search.php?query=Bokov%20Ingush", "archive-search-en"]
  ];
  let ingOk = false;
  for (const [u, name] of ingTries) {
    if (await trySave(u, name)) {
      ingOk = true;
      if (!name.includes("page") && !name.includes("search")) break;
    }
  }

  process.stdout.write(`\nDONE ruOk=${ruOk} ingOk=${ingOk}\n`);
  for (const f of fs.readdirSync(OUT)) {
    const st = fs.statSync(path.join(OUT, f));
    if (st.isFile()) process.stdout.write(`  ${f}\t${st.size}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
