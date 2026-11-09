const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const url =
  process.argv[2] ||
  "https://psv4.userapi.com/s/v1/d/Z-V6kqbkX-hwhQTp-m-RQOQPoJLPMlSKJTWMRwWm0am5KPatl36xMveJbVvEXuJ-tH9_q4Mbb_Qv5HZjsrWGIINUsZGuvRvfqn1152g-HHBdpwJc/Iai_BIastii_VIashagIkastash__Bokov_Akhmad.pdf";

const outDir = path.join(__dirname, "..", "data", "external", "synovya-beki");
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, "ing-iai-biastii.pdf");
const desk = path.join(process.env.USERPROFILE || "", "Desktop", "Iаи-бIаьстии-вIашагIкъасташ-ING.pdf");

function get(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          Accept: "*/*",
          Referer: "https://vk.com/",
        },
        timeout: 300000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 8) return reject(new Error("too many redirects"));
          return get(new URL(res.headers.location, u).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"] || "",
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

(async () => {
  process.stdout.write(`GET ${url}\n`);
  const r = await get(url);
  process.stdout.write(`status=${r.status} ct=${r.ct} bytes=${r.body.length} magic=${r.body.slice(0, 5)}\n`);
  if (r.status !== 200 || r.body.slice(0, 5).toString() !== "%PDF-") {
    fs.writeFileSync(path.join(outDir, "vk-pdf-fail.bin"), r.body.slice(0, 5000));
    process.exit(1);
  }
  fs.writeFileSync(dest, r.body);
  fs.writeFileSync(desk, r.body);
  process.stdout.write(`SAVED ${dest}\nSAVED ${desk}\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
