/**
 * Extract English text layer from Nichols Ingush Grammar PDF (no OCR).
 * Usage: node scripts/extract-nichols-text.js
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const pdfParse = require("pdf-parse");

const PDF = path.join(
  "C:",
  "Users",
  "admin",
  "Desktop",
  "РАЗГОВОРНИК",
  "textbooks-ingush",
  "nichols-ingush-grammar-2011",
  "source.pdf"
);
const OUT_DIR = path.join(path.dirname(PDF), "_extracted");
const TXT = path.join(OUT_DIR, "text.txt");
const META = path.join(OUT_DIR, "meta.json");

async function main() {
  const buf = await fs.readFile(PDF);
  const data = await pdfParse(buf);
  const text = data.text || "";
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(TXT, text, "utf8");
  await fs.writeFile(
    META,
    `${JSON.stringify(
      {
        source: "nichols-ingush-grammar-2011",
        title: "Ingush Grammar (Johanna Nichols, 2011)",
        pages: data.numpages,
        textChars: text.length,
        language: "en",
        extractedAt: new Date().toISOString(),
        pdfPath: PDF
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  process.stdout.write(`Pages: ${data.numpages}\nChars: ${text.length}\nWrote ${TXT}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
