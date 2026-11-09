const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const outDir = path.join(__dirname, "..", "data", "external", "synovya-beki");
fs.mkdirSync(outDir, { recursive: true });

function get(url, redirects = 0, encoding = null) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate",
          Referer: "https://vk.com/",
        },
        timeout: 180000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 12) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, url).href;
          process.stdout.write(`  -> ${res.statusCode} ${next}\n`);
          return get(next, redirects + 1, encoding).then(resolve, reject);
        }
        let stream = res;
        const enc = res.headers["content-encoding"];
        if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        const chunks = [];
        stream.on("data", (d) => chunks.push(d));
        stream.on("end", () =>
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"] || "",
            cd: res.headers["content-disposition"] || "",
            body: Buffer.concat(chunks),
            url,
          })
        );
        stream.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  // Wall post HTML — find doc link
  const wall = "https://vk.com/wall-117529662_130";
  process.stdout.write(`WALL ${wall}\n`);
  const w = await get(wall);
  fs.writeFileSync(path.join(outDir, "vk-wall-130.html"), w.body);
  process.stdout.write(`wall ${w.status} ${w.body.length}\n`);

  // Try decode as win1251 and utf8
  const htmlUtf = w.body.toString("utf8");
  const html1251 = require("node:iconv-lite")
    ? null
    : null;

  let html = htmlUtf;
  try {
    // Node doesn't have iconv-lite by default; use TextDecoder if available
    html = new TextDecoder("windows-1251").decode(w.body);
  } catch {
    html = htmlUtf;
  }

  const docs = new Set();
  for (const m of html.matchAll(/https?:\/\/(?:vk\.(?:com|ru)|psv4\.userapi\.com)[^"'\\\s<>]+/gi)) {
    docs.add(m[0].replace(/&amp;/g, "&"));
  }
  for (const m of html.matchAll(/doc(-?\d+)_(\d+)/g)) {
    docs.add(`https://vk.com/doc${m[1]}_${m[2]}`);
  }
  for (const m of html.matchAll(/"url"\s*:\s*"(https?:\\\/\\\/[^"]+)"/g)) {
    docs.add(m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
  }
  for (const m of html.matchAll(/href="(\/doc[^"]+)"/g)) {
    docs.add("https://vk.com" + m[1].replace(/&amp;/g, "&"));
  }

  // Also look near title
  const titleIdx = html.search(/бIаьстии|бІаьстии|Iаи б|Іаи б/i);
  process.stdout.write(`titleIdx=${titleIdx}\n`);
  if (titleIdx >= 0) {
    process.stdout.write(html.slice(titleIdx - 200, titleIdx + 600) + "\n");
  }

  process.stdout.write(`candidates (${docs.size}):\n`);
  for (const d of [...docs].slice(0, 50)) process.stdout.write(`  ${d}\n`);

  // Prefer doc links / userapi pdf
  const ordered = [...docs].sort((a, b) => {
    const score = (u) =>
      (/\.pdf/i.test(u) ? 10 : 0) +
      (/userapi\.com/i.test(u) ? 5 : 0) +
      (/\/doc/i.test(u) ? 3 : 0) +
      (/download/i.test(u) ? 4 : 0);
    return score(b) - score(a);
  });

  for (const u of ordered) {
    if (!/doc|pdf|userapi|download/i.test(u)) continue;
    process.stdout.write(`\nTRY ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  ${r.status} ${r.ct} ${r.cd} ${r.body.length}\n`);
      const isPdf = r.body.slice(0, 5).toString() === "%PDF-";
      if (isPdf && r.body.length > 100000) {
        const dest = path.join(outDir, "ing-iai-biastii.pdf");
        fs.writeFileSync(dest, r.body);
        const desk = path.join(process.env.USERPROFILE || "", "Desktop", "Iаи-бIаьстии-вIашагIкъасташ-ING.pdf");
        fs.writeFileSync(desk, r.body);
        process.stdout.write(`SAVED ${dest}\nSAVED ${desk}\n`);
        return;
      }
      // If HTML with iframe/download link
      if (r.ct.includes("html") || r.body.slice(0, 1).toString() === "<" || r.body.includes("doc_download")) {
        const h = r.body.toString("utf8");
        fs.writeFileSync(path.join(outDir, "vk-doc-page.html"), r.body);
        const dl = [
          ...h.matchAll(/https?:\/\/[^"'\\\s<>]+(?:\.pdf|\/doc[^"'\\\s<>]*)/gi),
          ...h.matchAll(/"(https?:\\\/\\\/psv4\.userapi\.com[^"]+)"/g),
          ...h.matchAll(/href="([^"]*doc_download[^"]*)"/g),
        ].map((m) => m[1].replace(/\\\//g, "/").replace(/&amp;/g, "&"));
        process.stdout.write(`  nested: ${dl.slice(0, 10).join("\n    ")}\n`);
        for (const n of dl) {
          process.stdout.write(`  NEST ${n}\n`);
          const f = await get(n.startsWith("http") ? n : "https://vk.com" + n);
          process.stdout.write(`    ${f.status} ${f.ct} ${f.body.length}\n`);
          if (f.body.slice(0, 5).toString() === "%PDF-" && f.body.length > 100000) {
            const dest = path.join(outDir, "ing-iai-biastii.pdf");
            fs.writeFileSync(dest, f.body);
            const desk = path.join(process.env.USERPROFILE || "", "Desktop", "Iаи-бIаьстии-вIашагIкъасташ-ING.pdf");
            fs.writeFileSync(desk, f.body);
            process.stdout.write(`SAVED ${dest}\n`);
            return;
          }
        }
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }

  // Try known doc IDs from topic scrape
  const known = [
    "https://vk.com/doc213020641_437384704",
    "https://vk.com/doc213020641_437384717",
    "https://vk.com/doc213020641_437384685",
    "https://vk.com/doc213020641_437384647",
    "https://vk.com/doc213020641_437384615",
    "https://vk.com/doc213020641_437384595",
    "https://vk.com/doc213020641_437384625",
    "https://vk.com/doc213020641_437384729",
    "https://vk.com/doc213020641_437384739",
    "https://vk.com/doc213020641_437384746",
    "https://vk.com/doc213020641_437384818",
    "https://vk.com/doc213020641_437384832",
    "https://vk.com/doc213020641_437384841",
    "https://vk.com/doc213020641_437384847",
  ];
  for (const u of known) {
    process.stdout.write(`\nKNOWN ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  ${r.status} ${r.ct} cd=${r.cd} ${r.body.length}\n`);
      if (r.body.slice(0, 5).toString() === "%PDF-" && r.body.length > 10_000_000) {
        // ~16.8MB target
        const dest = path.join(outDir, "ing-iai-biastii.pdf");
        fs.writeFileSync(dest, r.body);
        process.stdout.write(`SAVED ${dest} (${r.body.length})\n`);
        return;
      }
      // save page and look for title
      const h = r.body.toString("utf8");
      if (/бIаьстии|бІаьстии|Iаи б|Іаи б|iai.b/i.test(h) || /16[.,]8|176\d{5}/.test(h)) {
        process.stdout.write(`  MATCH title/size in page\n`);
        fs.writeFileSync(path.join(outDir, "vk-doc-match.html"), r.body);
        const urls = [...h.matchAll(/https?:\\\/\\\/psv4\.userapi\.com[^"\\]+/g)].map((m) =>
          m[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&")
        );
        const urls2 = [...h.matchAll(/https?:\/\/psv4\.userapi\.com[^"'\\\s<>]+/g)].map((m) => m[0]);
        for (const n of [...new Set([...urls, ...urls2])]) {
          process.stdout.write(`  DL ${n.slice(0, 120)}\n`);
          const f = await get(n);
          process.stdout.write(`    ${f.status} ${f.body.length} ${f.body.slice(0, 5)}\n`);
          if (f.body.slice(0, 5).toString() === "%PDF-") {
            const dest = path.join(outDir, "ing-iai-biastii.pdf");
            fs.writeFileSync(dest, f.body);
            const desk = path.join(process.env.USERPROFILE || "", "Desktop", "Iаи-бIаьстии-вIашагIкъасташ-ING.pdf");
            fs.writeFileSync(desk, f.body);
            process.stdout.write(`SAVED ${dest}\n`);
            return;
          }
        }
      }
      // Check Content-Disposition filename
      if (/Iаи|бIаьст|Боков|iai/i.test(r.cd) && r.body.slice(0, 5).toString() === "%PDF-") {
        const dest = path.join(outDir, "ing-iai-biastii.pdf");
        fs.writeFileSync(dest, r.body);
        process.stdout.write(`SAVED by filename ${dest}\n`);
        return;
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }

  process.stdout.write("FAILED\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
