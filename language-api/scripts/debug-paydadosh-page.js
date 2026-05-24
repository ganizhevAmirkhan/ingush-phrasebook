const url = process.argv[2];
if (!url) {
  console.error("Usage: node debug-paydadosh-page.js <url>");
  process.exit(1);
}

fetch(url, {
  headers: { "User-Agent": "ingush-phrasebook-import/1.0" }
})
  .then((r) => r.text())
  .then((html) => {
    console.log("len", html.length);
    console.log("h1", html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.slice(0, 200));
    console.log("quotes", [...html.matchAll(/«([^»]{2,120})»/g)].slice(0, 8).map((m) => m[1]));
    console.log("copy", html.match(/data-copy=\"([^\"]+)\"/i)?.[1]);
    console.log("og:title", html.match(/property=\"og:title\" content=\"([^\"]+)\"/i)?.[1]);
    console.log("snippet", html.match(/name=\"description\" content=\"([^\"]+)\"/i)?.[1]);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
