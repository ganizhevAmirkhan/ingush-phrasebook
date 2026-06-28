const fs = require("node:fs/promises");

async function main() {
  const CATEGORY_URL =
    "https://ghalghay.com/category/%D0%B8%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/";
  const res = await fetch(CATEGORY_URL, { headers: { "User-Agent": "test" } });
  const html = await res.text();
  const re = /href="(https:\/\/ghalghay\.com\/\d{4}\/\d{2}\/[^"]+)"/gi;
  let m;
  let link26;
  while ((m = re.exec(html))) {
    const dec = decodeURIComponent(m[1]);
    if (/урок[-\s]*26/i.test(dec)) {
      link26 = m[1];
      break;
    }
  }
  console.log("URL:", link26);
  const h = await fetch(link26, { headers: { "User-Agent": "test" } });
  const page = await h.text();
  await fs.writeFile("scripts/_sample-lesson-26.html", page, "utf8");
  const body = page.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
  console.log("entry-content len:", body?.[1]?.length || 0);
  const sample = (body?.[1] || page).slice(0, 4000);
  console.log("--- sample ---\n", sample.replace(/></g, ">\n<"));
}

main();
