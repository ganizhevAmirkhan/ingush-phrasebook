const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

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

async function resolvePdfFromDownloadPage(slug) {
  const html = await fetch(`https://dzurdzuki.com/download/${slug}/`);
  const m = html.match(/download-manager-files\/[^"'\s>]+\.pdf/i);
  return m ? `https://dzurdzuki.com/wp-content/uploads/${m[0]}` : null;
}

const CATALOG = [
  {
    id: "mott-2",
    grade: 2,
    type: "mott",
    title: "ГIалгIай мотт. 2 класс (2017)",
    pdf: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/galgaj-mott-2-klass.-2017-god.-.pdf",
    sizeMb: 108,
    localDir: "gialgaj-mott-2-klass-2017",
    status: "partial_local",
    nounClassValue: "exercises",
    note: "Скан; OCR есть частично. Белгалонаш в упражнениях."
  },
  {
    id: "mott-3",
    grade: 3,
    type: "mott",
    title: "ГIалgIай мотт. 3 класс (2017)",
    pdf: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/galgaj-mott-3-klass.-2017-god.-.pdf",
    sizeMb: 169,
    localDir: "gialgaj-mott-3-klass-2017",
    status: "not_downloaded",
    nounClassValue: "high",
    note: "Белгалде / белгалон — ключевой для классов."
  },
  {
    id: "mott-4",
    grade: 4,
    type: "mott",
    title: "ГIалgIай мотт. 4 класс (Гагиев, Котиева, Оздоев, 2009)",
    pdf: null,
    sizeMb: null,
    localDir: "gialgaj-mott-4-klass-2009",
    status: "not_on_dzurdzuki",
    nounClassValue: "high",
    note: "На dzurdzuki.com нет. Есть в каталоге РГБ (бумага). Альт: Гандалоева, Оздоев Р.И. (новее)."
  },
  {
    id: "gramatika-5",
    grade: 5,
    type: "gramatika",
    title: "ГIалgIай метта грамматика, 5 класс (2010)",
    pdf: "https://dzurdzuki.com/wp-content/uploads/download-manager-files/malsagova-l.-d.-cziczkieva-a.-d.-gialgiaj-metta-gramatika-5-klass.-magas-2010-g..pdf",
    sizeMb: 6.7,
    localDir: "gialgiai-metta-gramatika-5-klass-2010",
    status: "imported",
    nounClassValue: "very_high",
    note: "§40 таблица классов, упр. 23–24, 351–353."
  },
  {
    id: "gramatika-6-7",
    grade: [6, 7],
    type: "gramatika",
    title: "ГIалgIай метта грамматика, 6–7 класс (Оздоев, 2011)",
    slug: "ozdoev-i-a-ozdoev-r-i-gialgiaj-metta-gramatika-6-7-klass-2011",
    pdf: null,
    sizeMb: 24,
    localDir: "gialgiai-metta-gramatika-6-7-klass-2011",
    status: "not_downloaded",
    nounClassValue: "very_high",
    note: "6 классов, таблицы согласования."
  },
  {
    id: "gramatika-8-9",
    grade: [8, 9],
    type: "gramatika",
    title: "ГIалgIай метта грамматика, 8–9 класс (Оздоев, 2011)",
    slug: "ozdoev-i-a-ozdoev-r-i-gialgiaj-metta-gramatika-8-9-klass-2011",
    pdf: null,
    sizeMb: 10,
    localDir: "gialgiai-metta-gramatika-8-9-klass-2011",
    status: "not_downloaded",
    nounClassValue: "very_high",
    note: "Синтаксис + классы."
  },
  {
    id: "deshara-2",
    grade: 2,
    type: "reader",
    title: "Дешара книжка, 2 класс (2017)",
    slug: "deshara-knizhka-2-klass-2017",
    pdf: null,
    sizeMb: 14,
    localDir: "deshara-knizhka-2-klass-2017",
    status: "not_downloaded",
    nounClassValue: "low",
    note: "Читательская книга, не грамматика."
  },
  {
    id: "praktikum-1988",
    grade: null,
    type: "reference",
    title: "ГIалgIай мотт Iомабара практикум (Гандалоева, 1988)",
    slug: "gandaloeva-a-z-gialgiaj-mott-iomabara-praktikum-1988",
    pdf: null,
    sizeMb: 25,
    localDir: "gialgaj-mott-iomabara-praktikum-1988",
    status: "not_downloaded",
    nounClassValue: "medium",
    note: "Практикум, много упражнений на классы."
  }
];

async function main() {
  const bibHtml = await fetch("https://dzurdzuki.com/biblioteka/");
  const slugRe = /dzurdzuki\.com\/download\/([^/"'\s?#]+)/g;
  const slugs = [...new Set([...bibHtml.matchAll(slugRe)].map((m) => m[1]))].filter((s) =>
    /gialg|mot|gramat|klass|ozdoev|malsag|gandalo|deshar/i.test(s)
  );
  process.stderr.write(`Found ${slugs.length} download slugs on biblioteka\n`);

  for (const item of CATALOG) {
    if (!item.pdf && item.slug) {
      item.pdf = await resolvePdfFromDownloadPage(item.slug);
    }
    if (!item.pdf) {
      const guess = slugs.find((s) => {
        const g = String(Array.isArray(item.grade) ? item.grade[0] : item.grade);
        if (item.type === "gramatika" && /gramatika|metta/i.test(s)) {
          if (Array.isArray(item.grade)) return s.includes(`${item.grade[0]}-${item.grade[1]}`) || s.includes(`${item.grade[0]}-7`) || s.includes("6-7");
          return s.includes(`${g}-klass`) || s.includes(`${g}-kl`);
        }
        if (item.type === "mott") return s.includes("mott") && (s.includes(`${g}-klass`) || s.includes(`${g}-kl`));
        if (item.id === "deshara-2") return /deshar/i.test(s) && /2-klass|2-kl/i.test(s);
        if (item.id === "praktikum-1988") return /praktikum|iomabara/i.test(s);
        return false;
      });
      if (guess) {
        item.slug = guess;
        item.pdf = await resolvePdfFromDownloadPage(guess);
      }
    }
  }

  const out = {
    source: "dzurdzuki.com/biblioteka",
    fetchedAt: new Date().toISOString().slice(0, 10),
    forNounClasses: true,
    items: CATALOG
  };

  const outPath = path.join(__dirname, "..", "data", "grammar", "textbook-catalog.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

  for (const item of CATALOG) {
    const g = Array.isArray(item.grade) ? item.grade.join("-") : item.grade ?? "?";
    process.stdout.write(
      `[${g} кл] ${item.title}\n  PDF: ${item.pdf || "не найден"}\n  Статус: ${item.status} | ценность для классов: ${item.nounClassValue}\n\n`
    );
  }
  process.stdout.write(`\nSaved ${outPath}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
