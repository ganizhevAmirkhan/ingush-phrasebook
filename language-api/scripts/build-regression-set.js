const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const workspaceRoot = path.resolve(__dirname, "..", "..");
  const categoriesDir = path.join(workspaceRoot, "ingush-phrasebook-main", "categories");
  const outFile = path.join(__dirname, "..", "data", "regression-tests.json");

  const files = (await fs.readdir(categoriesDir)).filter((x) => x.endsWith(".json"));
  const tests = [];

  for (const file of files) {
    const full = path.join(categoriesDir, file);
    const json = JSON.parse(await fs.readFile(full, "utf8"));
    const category = json?.category || file.replace(".json", "");
    const items = Array.isArray(json?.items) ? json.items : [];
    for (const item of items) {
      if (!item?.ru || !item?.ing) continue;
      tests.push({
        id: item.id || `t_${tests.length + 1}`,
        category,
        ru: item.ru,
        expectedIng: item.ing
      });
    }
  }

  await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: tests }, null, 2), "utf8");
  process.stdout.write(`Generated ${tests.length} regression tests at ${outFile}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});

