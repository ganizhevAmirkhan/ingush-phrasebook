const fs = require("node:fs/promises");
const path = require("node:path");
const { refreshAllSources, translate } = require("../src/platform");

async function main() {
  await refreshAllSources();
  const file = path.join(__dirname, "..", "data", "regression-tests.json");
  const json = JSON.parse(await fs.readFile(file, "utf8"));
  const items = Array.isArray(json?.items) ? json.items : [];

  let pass = 0;
  let fail = 0;
  const failed = [];

  for (const t of items) {
    const result = await translate(t.ru);
    const got = (result?.translation || "").toString().toLowerCase().trim();
    const expected = (t.expectedIng || "").toString().toLowerCase().trim();
    if (result.ok && got === expected) {
      pass += 1;
    } else {
      fail += 1;
      if (failed.length < 30) {
        failed.push({
          ru: t.ru,
          expected: t.expectedIng,
          got: result?.translation || "",
          error: result?.error || ""
        });
      }
    }
  }

  process.stdout.write(`Regression done. pass=${pass} fail=${fail} total=${items.length}\n`);
  if (failed.length) {
    process.stdout.write(`${JSON.stringify({ failed }, null, 2)}\n`);
  }
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});

