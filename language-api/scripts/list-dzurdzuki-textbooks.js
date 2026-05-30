const https = require("node:https");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function main() {
  const html = await fetch("https://dzurdzuki.com/biblioteka/");
  const dlPages = [...new Set(html.match(/https:\/\/dzurdzuki\.com\/download\/[^"'\s<]+/g) || [])];
  const ingush = dlPages.filter((u) =>
    /gialg|mot|gramat|klass|deshar|ozdoev|malsag|gandalo/i.test(u)
  );
  process.stdout.write(`download pages: ${ingush.length}\n`);
  for (const page of ingush) {
    const pageHtml = await fetch(page);
    const pdf = pageHtml.match(/download-manager-files\/[^"'\s>]+\.pdf/i)?.[0];
    const title = pageHtml.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    process.stdout.write(`${title || page}\n  ${pdf ? "https://dzurdzuki.com/wp-content/uploads/" + pdf : "no direct pdf"}\n`);
  }

  const re = /download-manager-files\/[^"'\s>]+\.pdf/gi;
  const urls = [...new Set(html.match(re) || [])].map(
    (u) => `https://dzurdzuki.com/wp-content/uploads/${u}`
  );

  const wanted = [
    /gialg.*mot/i,
    /gialg.*metta.*gramatika/i,
    /gramatika.*klass/i,
    /2-klass|3-klass|4-klass|5-klass|6-7|8-9/i,
    /ozdoev.*gramatika/i,
    /malsagov.*gramatika/i,
    /gandalo/i,
    /deshara.*2/i
  ];

  const hits = urls.filter((u) => wanted.some((re) => re.test(u)));
  for (const u of hits.sort()) process.stdout.write(`${u}\n`);

  // Also try to match titles near wpdmdl links
  const blocks = html.split(/class="wpdm-download-link"/i);
  for (const block of blocks.slice(0, 500)) {
    const title = block.match(/title="([^"]{10,120})"/i)?.[1];
    const pdf = block.match(/download-manager-files\/[^"'\s>]+\.pdf/i)?.[0];
    if (!title || !pdf) continue;
    if (/мотт|gramatika|грамматика|класс|klass|deshara/i.test(title)) {
      process.stdout.write(`TITLE: ${title}\n  ${pdf}\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
