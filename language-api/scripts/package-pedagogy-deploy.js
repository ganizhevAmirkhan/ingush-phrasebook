/**
 * Собрать pedagogy-deploy.zip для VPS (Windows/Linux).
 * Usage: node scripts/package-pedagogy-deploy.js
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writeZip } = require("./lib/zip-forward");

const ROOT = path.join(__dirname, "..");
const STAGING = path.join(os.tmpdir(), "pedagogy-deploy-staging");
const OUT_ZIP = path.join(ROOT, "pedagogy-deploy.zip");

const FILES = [
  "package.json",
  "server.js",
  "src/admin-store.js",
  "src/platform.js",
  "src/schema.js",
  "data/grammar/rules.json",
  "data/grammar/ozdoev-1970-knowledge.json",
  "data/grammar/iomabara-praktikum-knowledge.json",
  "data/grammar/ozdoev-ortography-2003-knowledge.json",
  "data/grammar/hlanzara-ingush-knowledge.json",
  "data/corpus/stories/pedagogy_ozdoev_1970.json",
  "data/corpus/stories/pedagogy_iomabara_praktikum.json",
  "data/corpus/stories/pedagogy_hlanzara.json",
  "data/colloquial/ozdoev-1970-phrases.json",
  "data/colloquial/iomabara-praktikum-phrases.json",
  "data/colloquial/hlanzara-ingush-phrases.json",
  "scripts/import-pedagogy-books.js",
  "scripts/lib/pedagogy-parse.js",
  "scripts/lib/zip-forward.js",
  "scripts/install-pedagogy-on-vps.sh"
];

function copyStaging() {
  if (fs.existsSync(STAGING)) {
    fs.rmSync(STAGING, { recursive: true, force: true });
  }
  for (const rel of FILES) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`missing: ${rel}`);
    }
    const dest = path.join(STAGING, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function zipStaging() {
  if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);
  writeZip(OUT_ZIP, STAGING);
}

function main() {
  copyStaging();
  zipStaging();
  fs.rmSync(STAGING, { recursive: true, force: true });
  const stat = fs.statSync(OUT_ZIP);
  console.log(
    JSON.stringify(
      {
        ok: true,
        zip: OUT_ZIP,
        bytes: stat.size,
        files: FILES.length
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}
