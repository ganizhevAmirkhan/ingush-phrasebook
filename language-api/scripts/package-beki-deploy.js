/** Pack Beki corpus + phrases + workbench loader for VPS. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writeZip } = require("./lib/zip-forward");

const ROOT = path.join(__dirname, "..");
const STAGE = path.join(os.tmpdir(), "beki-deploy-staging");
const ZIP = path.join(ROOT, "beki-deploy.zip");
const DESKTOP = path.join(process.env.USERPROFILE || "", "Desktop", "beki-deploy-for-vps.zip");

const FILES = [
  "data/corpus/stories/synovya-beki.json",
  "data/colloquial/story_synovya_beki_001-workbench-phrases.json",
  "data/workbench/synovya-beki.workbench.json",
  "src/schema.js",
  "src/platform.js",
  "server.js",
  "public/tools/corpus-align.html",
  "public/tools/corpus-align.js",
  "public/tools/corpus-align.css",
  "public/tools/seed/synovya-beki.workbench.json",
  "scripts/install-beki-on-vps.sh",
];

function main() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  for (const rel of FILES) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) throw new Error(`missing ${rel}`);
    const dest = path.join(STAGE, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  fs.rmSync(ZIP, { force: true });
  writeZip(ZIP, STAGE);
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.copyFileSync(ZIP, DESKTOP);
  const st = fs.statSync(ZIP);
  process.stdout.write(
    JSON.stringify({ ok: true, zip: ZIP, desktop: DESKTOP, bytes: st.size, files: FILES.length }, null, 2) + "\n"
  );
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}
