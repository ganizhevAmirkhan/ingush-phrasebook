const fs = require("node:fs/promises");

async function fetchLesson(n) {
  const CATEGORY_URL =
    "https://ghalghay.com/category/%D0%B8%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/";
  for (let page = 1; page <= 6; page++) {
    const url = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}page/${page}/`;
    const html = await (await fetch(url)).text();
    const re = /href="(https:\/\/ghalghay\.com\/\d{4}\/\d{2}\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html))) {
      const dec = decodeURIComponent(m[1]);
      const nm = dec.match(/урок[-\s]*(\d+)/i);
      if (nm && Number(nm[1]) === n) return m[1];
    }
  }
}

async function main() {
  for (const n of [34, 36, 37]) {
    const link = await fetchLesson(n);
    const page = await (await fetch(link)).text();
    const body = page.match(/<div class="storycontent"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const plain = body.replace(/<[^>]+>/g, "\n").replace(/\s+/g, " ").trim();
    await fs.writeFile(`scripts/_sample-lesson-${n}.txt`, plain.slice(0, 5000), "utf8");
    console.log("Lesson", n, "chars:", plain.length);
  }
}

main();
