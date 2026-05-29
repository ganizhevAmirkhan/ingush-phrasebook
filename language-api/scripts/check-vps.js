async function get(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

(async () => {
  const base = process.argv[2] || "https://api.inghub.ru";
  console.log("=== VPS check:", base, "===\n");

  const health = await get(`${base}/health`);
  console.log("health", health.status, JSON.stringify(health.json));

  const metrics = await get(`${base}/metrics`);
  const c = metrics.json?.metrics?.current || {};
  console.log("\nmetrics.current:", JSON.stringify(c, null, 2));

  const tests = [
    "Добрый вечер.",
    "дикие животные",
    "сколько стоят яблоки",
    "А ты откуда?"
  ];
  for (const ru of tests) {
    const tr = await get(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ru })
    });
    const j = tr.json || {};
    console.log(`\n«${ru}» → ${j.ok ? `${j.translation} [${j.usedSource}]` : j.error}`);
  }

  console.log("\n--- deploy hints ---");
  if ((c.habarBasicRaw ?? 0) < 150) {
    console.log("Habar basic_phrases на VPS, похоже, старый. Нужен: git push + refresh pullCategories");
  }
  if (!c.habarBasicRaw && !c.habarItemsRaw) {
    console.log("Метрики habarItemsRaw нет — задеплойте новый platform.js + admin.js");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
