#!/usr/bin/env node
/**
 * Проверка sentence-composer без LLM.
 * node scripts/run-compose-tests.js
 */
const path = require("node:path");
const fs = require("node:fs/promises");

const ROOT = path.resolve(__dirname, "..");
const platform = require(path.join(ROOT, "src", "platform"));
const { normalizeText } = require(path.join(ROOT, "src", "schema"));

async function main() {
  const testsPath = path.join(ROOT, "data", "compose-tests.json");
  const tests = JSON.parse(await fs.readFile(testsPath, "utf8"));
  const items = Array.isArray(tests.items) ? tests.items : [];

  await platform.refreshAllSources();

  let passed = 0;
  let failed = 0;

  for (const item of items) {
    const result = await platform.translate(item.ru, { skipHabar: true });
    const got = (result.translation || "").trim();
    const expected = (item.expectedIng || "").trim();
    const ok =
      result.ok &&
      normalizeText(got) === normalizeText(expected) &&
      (result.confidence || 0) >= (item.minConfidence || 0.8);

    if (ok) {
      passed += 1;
      console.log(`OK  ${item.ru} -> ${got} (${result.usedSource}, ${result.confidence})`);
    } else {
      failed += 1;
      console.log(`FAIL ${item.ru}`);
      console.log(`  expected: ${expected}`);
      console.log(`  got:      ${got || "(empty)"} source=${result.usedSource} conf=${result.confidence}`);
      if (result.error) console.log(`  error: ${result.error}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${items.length} total`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
