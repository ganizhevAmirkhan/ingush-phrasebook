async function main() {
  const base = "https://ingushwarrior.neocities.org/";
  const pages = ["book1.html", "page1.html", "page2.html", "page3.html"];
  for (const p of pages) {
    const u = base + p;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    const hrefs = [...t.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
    const hasRu = /Небо было|Беки поднялся|Сагопши|Алханчурт|кукуруз/i.test(t);
    const hasIng = /[а-яё]{3,}.*(г1|т1|х1|ц1|аьлар|цунна)/i.test(t) || /Ӏ|ӏ/.test(t);
    process.stdout.write(`\n=== ${p} status=${r.status} len=${t.length} ru=${hasRu} ing=${hasIng} ===\n`);
    process.stdout.write(`hrefs(${hrefs.length}): ${hrefs.slice(0, 30).join(" | ")}\n`);
    // show text-ish chunks
    const text = t
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\s+\n/g, "\n")
      .replace(/\n+/g, "\n")
      .trim();
    process.stdout.write(text.slice(0, 1200) + "\n...\n");
  }
}
main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
