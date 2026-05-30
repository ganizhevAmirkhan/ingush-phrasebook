/**
 * Download Ingush textbooks OUTSIDE the git repo (sibling folder).
 * Default: ../textbooks-ingush relative to ingush-phrasebook-main
 *
 * Usage: node scripts/download-textbooks-external.js
 *        node scripts/download-textbooks-external.js --only=gramatika-6-7,gramatika-8-9
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const EXTERNAL_ROOT = path.resolve(REPO_ROOT, "..", "..", "textbooks-ingush");

const ITEMS = [
  {
    id: "gramatika-5",
    dir: "gialgiai-metta-gramatika-5-klass-2010",
    file: "source.pdf",
    url: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/malsagova-l.-d.-cziczkieva-a.-d.-gialgiaj-metta-gramatika-5-klass.-magas-2010-g..pdf",
    minBytes: 5_000_000
  },
  {
    id: "gramatika-6-7",
    dir: "gialgiai-metta-gramatika-6-7-klass-2011",
    file: "source.pdf",
    url: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Ozdoev-I.A-Ozdoev-R.I.-GIalgIaj-metta-grammatika-6-7-klass-2011.pdf",
    minBytes: 15_000_000
  },
  {
    id: "gramatika-8-9",
    dir: "gialgiai-metta-gramatika-8-9-klass-2011",
    file: "source.pdf",
    url: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Ozdoev-I.A-Ozdoev-R.I.-GIalgIaj-metta-grammatika-8-9-klass-2011.pdf",
    minBytes: 8_000_000
  },
  {
    id: "praktikum-1988",
    dir: "gialgaj-mott-iomabara-praktikum-1988",
    file: "source.pdf",
    url: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Gandaloeva-A.Z.-GIalgIaj-mott-Iomabara-praktikum-1988.pdf",
    minBytes: 20_000_000
  }
];

function parseOnly(argv) {
  const arg = argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  return new Set(arg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean));
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ingush-phrasebook/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function main() {
  const only = parseOnly(process.argv.slice(2));
  await fsp.mkdir(EXTERNAL_ROOT, { recursive: true });

  const manifest = {
    root: EXTERNAL_ROOT,
    note: "PDF и _extracted вне git-репозитория ingush-phrasebook-main",
    updatedAt: new Date().toISOString(),
    items: []
  };

  for (const item of ITEMS) {
    if (only && !only.has(item.id)) continue;

    const itemDir = path.join(EXTERNAL_ROOT, item.dir);
    const outPath = path.join(itemDir, item.file);
    await fsp.mkdir(itemDir, { recursive: true });

    let status = "skipped_exists";
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < item.minBytes) {
      process.stdout.write(`Downloading ${item.id}…\n`);
      const buf = await download(item.url);
      await fsp.writeFile(outPath, buf);
      status = "downloaded";
      process.stdout.write(`  → ${outPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)\n`);
    } else {
      process.stdout.write(`Already have ${item.id}: ${outPath}\n`);
    }

    manifest.items.push({
      id: item.id,
      path: outPath,
      status,
      url: item.url
    });
  }

  await fsp.writeFile(
    path.join(EXTERNAL_ROOT, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  process.stdout.write(`\nExternal root: ${EXTERNAL_ROOT}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
