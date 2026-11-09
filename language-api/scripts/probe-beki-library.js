async function main() {
  const urls = [
    "https://ingushwarrior.neocities.org/",
    "https://ingushwarrior.neocities.org/index.html",
    "https://ingushwarrior.neocities.org/beki.html",
    "https://ingushwarrior.neocities.org/text.html",
    "https://ingushwarrior.neocities.org/ru/",
    "https://ingushwarrior.neocities.org/ing/",
    "https://bibling.ru/book/%d1%81%d1%8b%d0%bd%d0%be%d0%b2%d1%8c%d1%8f-%d0%b1%d0%b5%d0%ba%d0%b8/"
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const hrefs = [...t.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 25);
      process.stdout.write(`\n${u}\n  status=${r.status} len=${t.length}\n`);
      process.stdout.write(`  hrefs: ${hrefs.join(" | ")}\n`);
      process.stdout.write(`  snippet: ${t.replace(/\s+/g, " ").slice(0, 220)}\n`);
    } catch (e) {
      process.stdout.write(`\n${u}\n  ERR ${e.message}\n`);
    }
  }
}

main();
