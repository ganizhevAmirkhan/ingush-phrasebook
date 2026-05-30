/**
 * Из Nichols 2011 — только то, чего нет в API (без дублей).
 *
 * Сверка с: noun-class-knowledge, declensions, grammar-overview,
 * nichols-priority-knowledge, rules, patterns.
 *
 * Usage: node scripts/import-nichols-unique.js
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const GRAMMAR = path.join(ROOT, "data", "grammar");
const OUT = path.join(GRAMMAR, "nichols-unique-knowledge.json");
const NOUN_CLASS_OUT = path.join(GRAMMAR, "noun-class-knowledge.json");

const NICHOLS = path.join(
  "C:",
  "Users",
  "admin",
  "Desktop",
  "РАЗГОВОРНИК",
  "textbooks-ingush",
  "nichols-ingush-grammar-2011",
  "_extracted",
  "text.txt"
);

const G2SCHOOL = { V: "va", J: "ya", B: "ba", D: "da" };

/** Nichols ch.7 — явная классификация (не дублировать §40 / имеющиеся записи) */
const NICHOLS_NOUNS = [
  { ing: "jett", ru: "корова", nichols: "B", plAgreement: "D", noteRu: "split OIG: nom jett, gen watta" },
  { ing: "zhwalii", ru: "собака", nichols: "D" },
  { ing: "kuorta", ru: "голова", nichols: "B", plAgreement: "D" },
  { ing: "q'oalam", ru: "карандаш, ручка", nichols: "J" },
  { ing: "ust", ru: "бык, вол", nichols: "B", plAgreement: "D" },
  { ing: "wagj", ru: "ложка", nichols: "J" },
  { ing: "maza", ru: "вошь", nichols: "J" },
  { ing: "wazh", ru: "яблоко", nichols: "B" },
  { ing: "beg", ru: "шутка", nichols: "B" },
  { ing: "toppar", ru: "глина, штукатурка", nichols: "B" },
  { ing: "nitt", ru: "крапива", nichols: "B" },
  { ing: "oaghuu", ru: "сторона", nichols: "B" },
  { ing: "tiesham", ru: "вера, доверие", nichols: "B", noteRu: "deverbal -am" },
  { ing: "kog", ru: "нога, ступня", nichols: "B", plAgreement: "B|D", noteRu: "вариативность у носителей" },
  { ing: "cu", ru: "жареная ячменная мука", nichols: "B", plAgreement: "B|D" },
  { ing: "mashen", ru: "машина, автомобиль", nichols: "J" },
  { ing: "limon", ru: "лимон", nichols: "J" },
  { ing: "nax", ru: "люди", nichols: "B" },
  { ing: "adam", ru: "человек", nichols: "D", noteRu: "исключение среди одушевлённых" },
  { ing: "ber", ru: "ребёнок", nichols: "D" },
  { ing: "nuskal", ru: "невеста", nichols: "D" },
  { ing: "jiwig", ru: "девочка", nichols: "J", plAgreement: "J" },
  { ing: "daa", ru: "отец", nichols: "V", plAgreement: "B" },
  { ing: "vosha", ru: "брат", nichols: "V", plAgreement: "B" },
  { ing: "naana", ru: "мать", nichols: "J", plAgreement: "B" },
  { ing: "jisha", ru: "сестра", nichols: "J", plAgreement: "B" },
  { ing: "sag", ru: "человек, лицо", nichols: "V", noteRu: "муж. референт" },
  { ing: "dulx", ru: "мясо", nichols: "D", noteRu: "пример O+gender на глаголе" },
  { ing: "meaq", ru: "хлеб", nichols: "J" }
];

/** OIG — начальный согласный = маркер класса (§7.3) */
const NICHOLS_OIG = [
  { ing: "moza", ru: "муха", nichols: "B" },
  { ing: "mux", ru: "ветер", nichols: "B" },
  { ing: "boardz", ru: "курган, насыпь", nichols: "B" },
  { ing: "bei", ru: "газон, трава", nichols: "B" },
  { ing: "bolx", ru: "работа", nichols: "B" },
  { ing: "pen", ru: "стена", nichols: "B" },
  { ing: "pxa", ru: "стрела", nichols: "B" },
  { ing: "dogha", ru: "дождь", nichols: "D" },
  { ing: "duq'", ru: "ярмо, горный гребень", nichols: "D" },
  { ing: "dig", ru: "топор", nichols: "D" },
  { ing: "dog", ru: "сердце", nichols: "D" },
  { ing: "nihw", ru: "кожа, шкура", nichols: "D" },
  { ing: "nadzh", ru: "дуб, жёлудь", nichols: "D" },
  { ing: "nux", ru: "плуг", nichols: "D" },
  { ing: "txyr", ru: "роса", nichols: "D" },
  { ing: "turs", ru: "щит", nichols: "D" },
  { ing: "t'ii", ru: "мост", nichols: "D" },
  { ing: "tux", ru: "соль", nichols: "D" },
  { ing: "juq'", ru: "середина, интервал", nichols: "J" },
  { ing: "jish", ru: "песня", nichols: "J" },
  { ing: "jexk", ru: "расчёска", nichols: "J", noteRu: "split OIG" },
  { ing: "juu", ru: "шило", nichols: "J" },
  { ing: "jis", ru: "иней", nichols: "J" },
  { ing: "jurt", ru: "город, село", nichols: "J" }
];

/** Без собственного класса — берут класс референта (§7.2) */
const NICHOLS_GENDERLESS = [
  { ing: "c'alx", ru: "очень кислый плод", noteRu: "согласование с подлежащим, не с предикатом" },
  { ing: "gilavodzh", ru: "кривой (лезвие косы)" },
  { ing: "ergazh", ru: "пёстрая окраска (архаизм)" },
  { ing: "sie hama", ru: "самка (животное)" },
  { ing: "mawa hama", ru: "самец (животное)" }
];

const NICHOLS_GENDER_VERBS = [
  { stem: "diett", ru: "бить, ударять" },
  { stem: "doaqq", ru: "извлекать" },
  { stem: "daarzha", ru: "распространять" },
  { stem: "du'", ru: "есть" },
  { stem: "dash", ru: "таять" },
  { stem: "diek", ru: "звенеть" },
  { stem: "diesh", ru: "читать, учиться" },
  { stem: "diest", ru: "опухать" },
  { stem: "diex", ru: "спрашивать" },
  { stem: "douz", ru: "знать, узнавать" },
  { stem: "duox", ru: "ломаться (непер.)" },
  { stem: "daax", ru: "жить" },
  { stem: "aara", ru: "выходить (+ V/J/B/D по S)" }
];

const NICHOLS_GENDER_ADJECTIVES = [
  { stem: "doaqqa", ru: "большой" },
  { stem: "dweaxa", ru: "длинный" },
  { stem: "dei", ru: "лёгкий, дешёвый" },
  { stem: "deassa", ru: "пустой" },
  { stem: "diq'a", ru: "густой, сухой, твёрдый" },
  { stem: "ditq'a", ru: "тонкий" },
  { stem: "dwaaixa", ru: "горячий" },
  { stem: "berriga", ru: "весь, все (прonominal)" }
];

/** Правила Nichols, которых нет в grammar-overview / noun-class / priority */
const NICHOLS_RULES = [
  {
    id: "six_target_genders",
    titleRu: "Шесть целевых (target) классов согласования",
    bodyRu: "По Corbett: 4 контроллера в ед.ч. (V,J,B,D), 3 в мн.ч. (J,B,D) → 6 пар sg/pl для согласования. Школьные 6 классов — другая сетка; Nichols V/J/B/D = 4 маркера на формах.",
    sourceRef: "nichols:ch7:(5)"
  },
  {
    id: "b_plural_mostly_d",
    titleRu: "Мн.ч. существительных B-класса",
    bodyRu: "У ~91% B-существительных с мн.ч. согласование в предикате переходит на D (не B). Исключения: wazh, beg, toppar, nitt и др.",
    sourceRef: "nichols:ch7:(4)"
  },
  {
    id: "predicate_nominal_agreement",
    titleRu: "Именное сказуемое: согласование с именной частью",
    bodyRu: "Copula согласуется с предикатом, не с подлежащем: «Mariem Muusaa vy» — играет Musa (V). Исключение: подлежащее 1–2 л. мн.ч. → согласование с подлежащим (D).",
    sourceRef: "nichols:ch19:19.1.3"
  },
  {
    id: "simplex_vs_compound_alignment",
    titleRu: "Simplex vs compound глаголы",
    bodyRu: "Simplex — эргатив по умолчанию, обязателен именительный pivot. Compound (light verb) — часто аккузативные паттерны, нет обязательного именительного.",
    sourceRef: "nichols:ch21"
  },
  {
    id: "no_passive",
    titleRu: "Нет пассива и antipassive",
    bodyRu: "Нет пассива, антипассива, dative shift. Именительный S/O — pivot; relation-changing derivations только лексические (causative, inceptive).",
    sourceRef: "nichols:ch21"
  },
  {
    id: "np_requires_predicate",
    titleRu: "Именная группа почти всегда с предикатом",
    bodyRu: "Ингушский не любит «голую» NP: даже там, где в русском/англ. достаточно фразы, часто добавляется copula с классовым согласованием (§5.10).",
    sourceRef: "nichols:ch5:5.10"
  },
  {
    id: "focus_particle_m",
    titleRu: "Конtrastive focus =m",
    bodyRu: "Частица =m — эмфатическое/контрастное фокусирование, присоединяется к слову в scope (часто в начале клаузы).",
    sourceRef: "nichols:ch33:33.1.1"
  },
  {
    id: "numeral_oblique_declension",
    titleRu: "Числительные склоняются как прилагательные",
    bodyRu: "Cardinal: nominative/oblique (cwa/cwan); nominalized forms склоняются по падежам (cweanniena и т.д.) — см. прилож. 4.",
    sourceRef: "nichols:appendix_4"
  }
];

/** Главы без конспекта в nichols-priority — только уникальное */
const NICHOLS_OTHER_CHAPTERS = [
  { n: 1, titleRu: "Язык и носители", summaryRu: "В типологической выборке Nichols ингушский — самый морфологически сложный среди сравниваемых языков (не полисинтетический)." },
  { n: 2, titleRu: "Звуковая система", summaryRu: "Большие инвентари гласных и согласных; короткие гласные крайне централизованы; частичные слияния и контекстные нейтрализации." },
  { n: 3, titleRu: "Фонологические процессы", summaryRu: "Продуктивный аблаут во всех регулярных глагольных парадигмах; морфофонемика + фонотактика." },
  { n: 4, titleRu: "Просодия", summaryRu: "Три категории: ударение (обычно начальное), фразовое акцентирование, тон (high vs unmarked)." },
  { n: 5, titleRu: "Части речи", summaryRu: "Три класса: существ., глагол, modifier (прил. = наречие образа действия; причастие ≈ converb)." },
  { n: 8, titleRu: "Образование существительных", summaryRu: "≥2000 простых существ.; номinalization глагола продуктивна (cleft, complement, relativization)." },
  { n: 11, titleRu: "Прилагательные и причастия", summaryRu: "Сотни базовых прилаг.; причастия/converbs легко лексicalizуются как прилаг." },
  { n: 12, titleRu: "Классы спряжения глаголов", summaryRu: "Система Handel 2003 / Nichols 2004; present stem — лучшая цитатная форма." },
  { n: 13, titleRu: "Категории глагола", summaryRu: "Полная система времён, наклонений, evidentials, converbs; прилож. 5 — парадигма «drink»." },
  { n: 14, titleRu: "Число глагола", summaryRu: "Pluractionality и simulfactive — морфологически различимы." },
  { n: 15, titleRu: "Структура глагола", summaryRu: "Causative (direct/indirect), inceptive, deadjectival — suffixal derivations." },
  { n: 16, titleRu: "Несклоняемые", summaryRu: "Междометия, частицы, clitics; отдельно от modifier." },
  { n: 17, titleRu: "Послелоги", summaryRu: "Postpositions + relational nouns; пространственные серии (locative, allative, ablative)." },
  { n: 20, titleRu: "Именные группы", summaryRu: "NP internal structure; associatives (Easetaar); focus gemination." },
  { n: 22, titleRu: "Обстоятельства", summaryRu: "Non-arguments: temporal, locative, manner — не аргументы валентности." },
  { n: 23, titleRu: "Сравнение", summaryRu: "Сравнительный падеж -l; periphrastic comparatives." },
  { n: 25, titleRu: "Комплементация", summaryRu: "Придаточные-дополнения; nominalized participles as complements." },
  { n: 26, titleRu: "Относительные", summaryRu: "Headless relativization через nominalization." },
  { n: 27, titleRu: "Обстоятельственные придаточные", summaryRu: "Temporal, causal adjunct clauses." },
  { n: 28, titleRu: "Номинализация и cleft", summaryRu: "Clefting через nominalized verb + copula." },
  { n: 29, titleRu: "Кореференция", summaryRu: "Reflexives sie/hwie; obviation in 3rd person." },
  { n: 30, titleRu: "Порядок слов", summaryRu: "SOV default; verb-second в некоторых типах; existentials." },
  { n: 33, titleRu: "Прагматика", summaryRu: "Discourse particles; =m focus; narrative chaining." },
  { n: 35, titleRu: "Тексты", summaryRu: "Фольклор (Dumézil 1936), разговорные записи, oldest Ingush." }
];

/** Appendix 1 — парадигмы, которых нет в declensions.json */
const NICHOLS_PARADIGMS = [
  {
    id: "nichols_paradigm_jurt",
    labelRu: "Склонение «город» (jurt, decl. Nichols)",
    lemmaIng: "jurt",
    lemmaRu: "город",
    genderNichols: "J",
    singular: {
      nom: "jurt", gen: "jurta", dat: "jurtaa", erg: "jurtuo", all: "jurtaga",
      ins: "jurtaca", lat: "jurtagh", cmp: "jurtal"
    },
    plural: {
      nom: "jurtazh", gen: "jurtii", dat: "jurtazhta", erg: "jurtazh",
      all: "jurtazhka", ins: "jurtazhca", lat: "jurtegh", cmp: "jurtel"
    },
    sourceRef: "nichols:appendix_1"
  },
  {
    id: "nichols_paradigm_leatta",
    labelRu: "Склонение «земля» (leatta)",
    lemmaIng: "leatta",
    lemmaRu: "земля",
    singular: {
      nom: "leatta", gen: "leattan", dat: "leattaa", erg: "leattuo", all: "leattaaga",
      ins: "leattaaca", lat: "leattaagh", cmp: "leattaal"
    },
    plural: {
      nom: "leattaazh", gen: "leattaai", dat: "leattaazhta", erg: "leattaazh",
      all: "leattaazhka", ins: "leattaazhca", lat: "leattaajegh", cmp: "leattaajel"
    },
    sourceRef: "nichols:appendix_1"
  },
  {
    id: "nichols_paradigm_daa",
    labelRu: "Склонение «отец» (daa)",
    lemmaIng: "daa",
    lemmaRu: "отец",
    genderNichols: "V",
    singular: {
      nom: "daa", gen: "dea", dat: "deana", erg: "daaz", all: "deaga",
      ins: "deaca", lat: "deagh", cmp: "deal"
    },
    plural: {
      nom: "dei", gen: "dei", dat: "deazhta", erg: "deazh",
      all: "deazhka", ins: "deazhca", lat: "deajegh", cmp: "deajel"
    },
    sourceRef: "nichols:appendix_1"
  },
  {
    id: "nichols_paradigm_jett",
    labelRu: "Склонение «корова» (jett, split OIG)",
    lemmaIng: "jett",
    lemmaRu: "корова",
    genderNichols: "B",
    noteRu: "Имен. jett; род. watta; мн. doaxan (suppletive)",
    singular: { nom: "jett", gen: "watta" },
    plural: { nom: "doaxan" },
    sourceRef: "nichols:ch7:(20)"
  }
];

const PRIORITY_CHAPTER_NUMS = new Set([6, 7, 9, 10, 18, 19, 21, 24, 31, 32, 34]);

function normKey(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-zа-яё0-9]/gi, "");
}

function nicholsToEntry(row) {
  const marker = G2SCHOOL[row.nichols];
  if (!marker) return null;
  const pl = row.plAgreement
    ? row.plAgreement.includes("|")
      ? row.plAgreement.split("|").map((x) => G2SCHOOL[x.trim()] || x.trim())
      : G2SCHOOL[row.plAgreement] || row.plAgreement
    : marker;
  return {
    id: `nichols_nc_${normKey(row.ing)}`,
    ing: row.ing,
    ru: row.ru || null,
    markerSg: marker,
    markerPl: typeof pl === "string" ? pl : pl,
    nicholsGender: row.nichols,
    noteRu: row.noteRu || null,
    sources: [{ book: "nichols-ingush-grammar-2011", ref: "ch7", verified: "academic" }],
    reviewStatus: "nichols_extract",
    oig: !!row.oig
  };
}

async function loadKnownNouns() {
  const known = new Set();
  const knownRu = new Set();

  const nc = JSON.parse(await fs.readFile(path.join(GRAMMAR, "noun-class-knowledge.json"), "utf8"));
  for (const e of nc.entries || []) {
    const fromNichols =
      e.reviewStatus === "nichols_extract" ||
      (e.sources || []).some((s) => String(s.book || "").includes("nichols"));
    if (fromNichols) continue;
    if (e.ing) known.add(normKey(e.ing));
    if (e.ru) knownRu.add(normKey(e.ru));
  }

  const ov = JSON.parse(await fs.readFile(path.join(GRAMMAR, "grammar-overview-knowledge.json"), "utf8"));
  for (const s of ov.sections || []) {
    if (s.lemmaIng) known.add(normKey(s.lemmaIng));
    if (s.lemmaRu) knownRu.add(normKey(s.lemmaRu));
  }

  known.add(normKey("мотт"));
  known.add(normKey("mott"));

  return { known, knownRu };
}

async function loadKnownParadigmLemmas() {
  const lemmas = new Set();
  const dec = JSON.parse(await fs.readFile(path.join(GRAMMAR, "declensions.json"), "utf8"));
  for (const d of dec.declensions || []) {
    if (d.ingBase) lemmas.add(normKey(d.ingBase));
    if (d.ru) lemmas.add(normKey(d.ru));
    for (const bucket of [d.singular, d.plural, d.forms]) {
      if (!bucket || typeof bucket !== "object") continue;
      for (const v of Object.values(bucket)) {
        if (typeof v === "string") lemmas.add(normKey(v));
        else if (v && typeof v === "object") {
          for (const f of Object.values(v)) {
            if (typeof f === "string") lemmas.add(normKey(f));
          }
        }
      }
    }
  }
  return lemmas;
}

function isDuplicateNoun(row, { known, knownRu }) {
  if (known.has(normKey(row.ing))) return true;
  if (row.ru && knownRu.has(normKey(row.ru))) return true;
  return false;
}

function isDuplicateParadigm(p, paradigmLemmas) {
  return paradigmLemmas.has(normKey(p.lemmaIng));
}

function isDuplicateRule(ruleId, existingIds) {
  return existingIds.has(ruleId);
}

async function main() {
  const { known, knownRu } = await loadKnownNouns();
  const paradigmLemmas = await loadKnownParadigmLemmas();

  const existingRuleIds = new Set();
  const priority = JSON.parse(
    await fs.readFile(path.join(GRAMMAR, "nichols-priority-knowledge.json"), "utf8")
  );
  for (const ch of priority.chapters || []) {
    if (ch.id) existingRuleIds.add(ch.id.replace("nichols_ch", "ch_"));
  }

  const nounRows = [...NICHOLS_NOUNS, ...NICHOLS_OIG.map((r) => ({ ...r, oig: true }))];
  const baselineKnown = new Set(known);
  const baselineKnownRu = new Set(knownRu);
  const nounClassEntries = [];
  const skippedNouns = [];

  /** Парадигмы — только если такой ingBase ещё нет в declensions */
  const paradigms = NICHOLS_PARADIGMS.filter((p) => !isDuplicateParadigm(p, paradigmLemmas));

  for (const row of nounRows) {
    const entry = nicholsToEntry(row);
    if (!entry) continue;
    entry.oig = !!row.oig;
    if (isDuplicateNoun(row, { known: baselineKnown, knownRu: baselineKnownRu })) {
      entry.alreadyInApi = true;
      skippedNouns.push({ ing: row.ing, ru: row.ru, reason: "already_in_api_before_nichols" });
    }
    nounClassEntries.push(entry);
  }

  const rules = NICHOLS_RULES.filter((r) => !isDuplicateRule(r.id, existingRuleIds));

  const otherChapters = NICHOLS_OTHER_CHAPTERS.filter((c) => !PRIORITY_CHAPTER_NUMS.has(c.n));

  const out = {
    schema: "nichols-unique-knowledge/v1",
    source: "nichols-ingush-grammar-2011",
    sourceUrl: "https://escholarship.org/uc/item/3nn7z6w5",
    noteRu:
      "Только материал Nichols, отсутствующий в noun-class-knowledge, declensions, grammar-overview и nichols-priority. Без повторов.",
    generatedAt: new Date().toISOString(),
    stats: {
      nounClassEntries: nounClassEntries.length,
      nounClassNewToApi: nounClassEntries.filter((e) => !e.alreadyInApi).length,
      skippedNounsDuplicate: skippedNouns.length,
      genderVerbs: NICHOLS_GENDER_VERBS.length,
      genderAdjectives: NICHOLS_GENDER_ADJECTIVES.length,
      genderlessNouns: NICHOLS_GENDERLESS.length,
      paradigms: paradigms.length,
      rules: rules.length,
      otherChapterSummaries: otherChapters.length
    },
    nounClassEntries,
    skippedNounsDuplicate: skippedNouns,
    genderAgreeingVerbs: NICHOLS_GENDER_VERBS,
    genderAgreeingAdjectives: NICHOLS_GENDER_ADJECTIVES,
    genderlessNouns: NICHOLS_GENDERLESS,
    paradigms,
    rules,
    otherChapterSummaries: otherChapters,
    targetGenderClasses: [
      { id: "human", sg: "V/J", pl: "B", ru: "люди (по полу в ед., B в мн.)" },
      { id: "t1", sg: "V/J", pl: "D", ru: "1–2 л. мн.ч." },
      { id: "t2", sg: "B", pl: "B", ru: "неодуш. B, мн. B" },
      { id: "t3", sg: "B", pl: "D", ru: "неодуш. B, мн. D (типично)" },
      { id: "t4", sg: "D", pl: "D", ru: "неодуш. D" },
      { id: "t5", sg: "J", pl: "J", ru: "неодуш. J" }
    ]
  };

  await fs.writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  /** Добавить новые записи классов в noun-class-knowledge (без дублей по ing) */
  const ncRaw = JSON.parse(await fs.readFile(NOUN_CLASS_OUT, "utf8"));
  const existingIds = new Set((ncRaw.entries || []).map((e) => e.id));
  const existingIng = new Set((ncRaw.entries || []).map((e) => normKey(e.ing)));
  let merged = 0;
  for (const entry of nounClassEntries) {
    if (entry.alreadyInApi) continue;
    const { alreadyInApi, ...toSave } = entry;
    if (existingIds.has(toSave.id) || existingIng.has(normKey(toSave.ing))) continue;
    ncRaw.entries.push({
      ...toSave,
      composerRuleIds: [`existential_${toSave.markerSg}`],
      grammaticalClass:
        toSave.markerSg === "va" ? "1" : toSave.markerSg === "ya" ? "2" : toSave.markerSg === "ba" ? "3" : "4"
    });
    merged += 1;
  }
  if (merged > 0) {
    ncRaw.generatedAt = new Date().toISOString();
    ncRaw.stats = ncRaw.stats || {};
    ncRaw.stats.entries = ncRaw.entries.length;
    ncRaw.stats.fromNichols = (ncRaw.stats.fromNichols || 0) + merged;
    await fs.writeFile(NOUN_CLASS_OUT, `${JSON.stringify(ncRaw, null, 2)}\n`, "utf8");
  }

  /** Парадигмы → declensions.json (без дублей id) */
  const DEC_FILE = path.join(GRAMMAR, "declensions.json");
  const decRaw = JSON.parse(await fs.readFile(DEC_FILE, "utf8"));
  const decIds = new Set((decRaw.declensions || []).map((d) => d.id));
  let paradigmsMerged = 0;
  for (const p of paradigms) {
    if (decIds.has(p.id)) continue;
    decRaw.declensions.push({
      id: p.id,
      label: p.labelRu,
      ru: p.lemmaRu,
      ingBase: p.lemmaIng,
      source: "Nichols 2011, appendix 1",
      nicholsGender: p.genderNichols || null,
      noteRu: p.noteRu || null,
      singular: p.singular,
      plural: p.plural
    });
    decIds.add(p.id);
    paradigmsMerged += 1;
  }
  if (paradigmsMerged > 0) {
    await fs.writeFile(DEC_FILE, `${JSON.stringify(decRaw, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`Wrote ${OUT}\n`);
  process.stdout.write(
    `New noun classes: ${nounClassEntries.length} (${merged} merged into noun-class-knowledge)\n`
  );
  process.stdout.write(`Paradigms: ${paradigms.length} (${paradigmsMerged} → declensions.json), rules: ${rules.length}, chapters: ${otherChapters.length}\n`);
  process.stdout.write(`Skipped duplicates: ${skippedNouns.length}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
