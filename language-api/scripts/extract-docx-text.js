/**
 * Extract plain text from .docx (word/document.xml).
 * Usage: node scripts/extract-docx-text.js <input.docx> [output.txt]
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

function unzipDocx(input, tmp) {
  fs.mkdirSync(tmp, { recursive: true });
  const zipCopy = path.join(tmp, "archive.zip");
  fs.copyFileSync(input, zipCopy);
  try {
    execSync(`tar -xf "${zipCopy}" -C "${tmp}"`, { stdio: "pipe" });
    return;
  } catch {
    /* fall through */
  }
  const ps =
    process.env.SystemRoot
      ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      : "powershell.exe";
  execSync(
    `"${ps}" -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
    { stdio: "pipe" }
  );
}

const input = path.resolve(process.argv[2] || "");
const output = path.resolve(
  process.argv[3] || input.replace(/\.docx$/i, "-extracted.txt")
);

if (!input || !fs.existsSync(input)) {
  console.error("Usage: node scripts/extract-docx-text.js <file.docx> [out.txt]");
  process.exit(1);
}

const tmp = path.join(path.dirname(input), `_unzip_${Date.now()}`);

try {
  unzipDocx(input, tmp);

  const xmlPath = path.join(tmp, "word", "document.xml");
  const xml = fs.readFileSync(xmlPath, "utf8");
  const text = xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

  const lines = text
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ output, lines: lines.length, chars: text.length }, null, 2));
  console.log("--- head ---");
  console.log(lines.slice(0, 40).join("\n"));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
