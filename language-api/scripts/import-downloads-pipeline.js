/**
 * Pipeline: copy Ingush pedagogy PDFs from Downloads → extract → import.
 *
 * Order (logical chain):
 *   1. Оздоев 1970 (педпособие)
 *   2. Практикум Ӏомабара
 *   3. Орфография 2003
 *   4. Хlанзара (университетский курс)
 *
 * Usage:
 *   node scripts/import-downloads-pipeline.js
 *   node scripts/import-downloads-pipeline.js --downloads=C:/Users/admin/Downloads
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DEFAULT_DOWNLOADS = "C:/Users/admin/Downloads";

const CHAIN = [
  {
    key: "ozdoev-1970",
    externalDir: "ozdoev-1970",
    match: (f) => f.includes("Хьехар") && f.includes("пособи")
  },
  {
    key: "iomabara-praktikum",
    externalDir: "iomabara-praktikum",
    match: (f) => f.includes("практикум") || f.includes("Iомабара")
  },
  {
    key: "ozdoev-ortography-2003",
    externalDir: "ozdoev-ortography",
    match: (f) => f.includes("орфографи") && f.toLowerCase().includes("г")
  },
  {
    key: "hlanzara-ingush",
    externalDir: "hlanzara-ingush",
    match: (f) => f.includes("Хlанзара") || f.includes("Ханзара")
  }
];

function findPdf(downloadsDir, matchFn) {
  const files = fs.readdirSync(downloadsDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  return files.find(matchFn) || null;
}

function runNode(script, args = []) {
  const res = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (res.status !== 0) {
    throw new Error(`${script} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function main() {
  const downloadsArg = process.argv.find((a) => a.startsWith("--downloads="));
  const downloadsDir = downloadsArg ? path.resolve(downloadsArg.slice(12)) : DEFAULT_DOWNLOADS;
  if (!fs.existsSync(downloadsDir)) {
    console.error(`Downloads folder not found: ${downloadsDir}`);
    process.exit(1);
  }

  const copied = [];
  for (const step of CHAIN) {
    const name = findPdf(downloadsDir, step.match);
    if (!name) {
      console.warn(`[skip] PDF not found for ${step.key}`);
      continue;
    }
    const src = path.join(downloadsDir, name);
    const destDir = path.join(ROOT, "data", "external", step.externalDir);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, "source.pdf");
    fs.copyFileSync(src, dest);
    copied.push({ key: step.key, file: name, dest });
  }

  console.log("Copied:", JSON.stringify(copied, null, 2));

  const only = copied.map((c) => c.key).join(",");
  if (!only) {
    console.error("No PDFs copied — nothing to import");
    process.exit(1);
  }

  const out = runNode("import-pedagogy-books.js", [`--only=${only}`]);
  console.log(out);
}

main();
