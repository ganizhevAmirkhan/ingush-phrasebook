/**
 * OCR путает палочку (1) с «!» — заменить во всех ингушских файлах Ашик-Кериб.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "data", "external", "ashik-kerib");
const DESKTOP = path.join(process.env.USERPROFILE || "", "Desktop", "Ашик-Кериб-инг-полный.doc");

function fixPalochka(text) {
  return text.replace(/!/g, "1");
}

function isIngushFile(rel) {
  const base = path.basename(rel).toLowerCase();
  if (/^ru[-.]/.test(base) || base.includes("ru-phrases") || base.includes("ru-sentences") || base === "ru-raw.txt") {
    return false;
  }
  if (!/\.(txt|doc|rtf|html)$/i.test(rel)) return false;
  if (rel.includes("meta.json")) return false;
  return true;
}

async function walk(dir, out = []) {
  for (const name of await fsp.readdir(dir)) {
    const full = path.join(dir, name);
    const st = await fsp.stat(full);
    if (st.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  let changed = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (!isIngushFile(rel)) continue;
    const raw = await fsp.readFile(file, "utf8");
    const fixed = fixPalochka(raw);
    if (fixed !== raw) {
      await fsp.writeFile(file, fixed, "utf8");
      changed += 1;
    }
  }
  if (fs.existsSync(DESKTOP)) {
    try {
      const raw = await fsp.readFile(DESKTOP, "utf8");
      const fixed = fixPalochka(raw);
      if (fixed !== raw) {
        await fsp.writeFile(DESKTOP, fixed, "utf8");
        changed += 1;
      }
    } catch (e) {
      if (e.code !== "EBUSY") throw e;
      process.stdout.write("Desktop .doc занят — закройте Word и перезапустите fix-ashik-palochka.js\n");
    }
  }
  process.stdout.write(`Исправлено файлов: ${changed}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
