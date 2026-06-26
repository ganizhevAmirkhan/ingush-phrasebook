/**
 * Parser for М.М. Султыгова «Русско-ингушский разговорник» (2013).
 * OCR text: 3 columns — русский | транскрипция | орфография.
 */
const { isUsableRu } = require("../../src/phrase-split");
const { normalizeText } = require("../../src/schema");

const SKIP_PAGE_MAX = 7;

const SECTION_HEADERS = [
  "ПРИВЕТСТВИЕ",
  "ПРОЩАНИЕ",
  "ОБРАЩЕНИЕ",
  "ЗНАКОМСТВО",
  "ВСТУПЛЕНИЕ В РАЗГОВОР",
  "ПОНИМАНИЕ (ЗНАНИЕ) ЯЗЫКА",
  "ПОНИМАНИЕ ЯЗЫКА",
  "ФОРМУЛЫ ВЕЖЛИВОСТИ",
  "БЛАГОДАРНОСТЬ",
  "ВОПРОСЫ",
  "УКЛОНЧИВЫЕ ОТВЕТЫ",
  "ЭМОЦИИ",
  "ПОЗДРАВЛЕНИЯ",
  "ПОЖЕЛАНИЯ",
  "ПУТЕШЕСТВИЕ",
  "АВТОМОБИЛЬ",
  "АВТОМОБИЛЬ, ДОРОГА",
  "ГОСТИНИЦА",
  "РАЗМЕЩЕНИЕ В ГОСТИНИЦЕ",
  "РЕСТОРАН",
  "АЭРОПОРТ",
  "ЖЕЛЕЗНОДОРОЖНЫЙ ВОКЗАЛ",
  "ВОКЗАЛ",
  "ТЕЛЕФОН",
  "СВЯЗЬ",
  "МАГАЗИН, ПОКУПКИ",
  "МАГАЗИН",
  "БОЛЬНИЦА",
  "В ПОЛИЦИЮ",
  "ПОЛИЦИЯ",
  "АПТЕКА",
  "ВРЕМЕНА ГОДА, ПОГОДА",
  "ВРЕМЕНА ГОДА",
  "ПОГОДА",
  "ЕДА",
  "НА УЛИЦЕ",
  "В ГОРОДЕ",
  "ДЕНЬГИ",
  "СЕМЬЯ",
  "ДЕТИ",
  "ШКОЛА",
  "РАБОТА",
  "СПОРТ",
  "ИНТЕРНЕТ",
  "СОБОЛЕЗНОВАНИЯ",
  "УТЕШЕНИЕ",
  "СОМНЕНИЯ",
  "РАДОСТЬ",
  "ГНЕВ",
  "СТРАХ",
  "УДИВЛЕНИЕ",
  "ОТКАЗ",
  "СОГЛАСИЕ"
];

const SECTION_TO_CATEGORY = {
  ПРИВЕТСТВИЕ: "greetings",
  ПРОЩАНИЕ: "greetings",
  ОБРАЩЕНИЕ: "conversation",
  ЗНАКОМСТВО: "personal_info",
  "ВСТУПЛЕНИЕ В РАЗГОВОР": "conversation",
  "ПОНИМАНИЕ (ЗНАНИЕ) ЯЗЫКА": "communication",
  "ПОНИМАНИЕ ЯЗЫКА": "communication",
  "ФОРМУЛЫ ВЕЖЛИВОСТИ": "conversation",
  БЛАГОДАРНОСТЬ: "conversation",
  ВОПРОСЫ: "conversation",
  "УКЛОНЧИВЫЕ ОТВЕТЫ": "conversation",
  ЭМОЦИИ: "emotions",
  ПОЗДРАВЛЕНИЯ: "celebration",
  ПОЖЕЛАНИЯ: "celebration",
  ПУТЕШЕСТВИЕ: "travel",
  АВТОМОБИЛЬ: "transport",
  "АВТОМОБИЛЬ, ДОРОГА": "transport",
  ГОСТИНИЦА: "travel",
  "РАЗМЕЩЕНИЕ В ГОСТИНИЦЕ": "travel",
  РЕСТОРАН: "food",
  АЭРОПОРТ: "travel",
  "ЖЕЛЕЗНОДОРОЖНЫЙ ВОКЗАЛ": "travel",
  ВОКЗАЛ: "travel",
  ТЕЛЕФОН: "communication",
  СВЯЗЬ: "communication",
  "МАГАЗИН, ПОКУПКИ": "shop",
  МАГАЗИН: "shop",
  БОЛЬНИЦА: "health",
  "В ПОЛИЦИЮ": "help",
  ПОЛИЦИЯ: "help",
  АПТЕКА: "health",
  "ВРЕМЕНА ГОДА, ПОГОДА": "weather",
  "ВРЕМЕНА ГОДА": "weather",
  ПОГОДА: "weather",
  ЕДА: "food",
  "НА УЛИЦЕ": "city",
  "В ГОРОДЕ": "city",
  ДЕНЬГИ: "money",
  СЕМЬЯ: "family",
  ДЕТИ: "family",
  ШКОЛА: "work",
  РАБОТА: "work",
  СПОРТ: "misc",
  ИНТЕРНЕТ: "communication",
  СОБОЛЕЗНОВАНИЯ: "emotions",
  УТЕШЕНИЕ: "emotions",
  СОМНЕНИЯ: "emotions",
  РАДОСТЬ: "emotions",
  ГНЕВ: "emotions",
  СТРАХ: "emotions",
  УДИВЛЕНИЕ: "emotions",
  ОТКАЗ: "conversation",
  СОГЛАСИЕ: "conversation"
};

function normalizeSpace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function slugSection(section) {
  return (section || "misc")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

const RU_STARTERS =
  /^(живи|будь|пусть|счастлив|доброе|добрый|доброй|спасибо|извините|простите|пожалуйста|как|что|где|когда|кто|чей|сколько|какой|какая|какие|мне|я |вы |мы |это|все|нет|да|можно|нельзя|очень|большое|садись|открой|закрой|передай|помогите|скажите|повтори|хочу|могу|нужно|нужен|дайте|здравствуй|привет|до свидания|всего|оставайтесь|я бы|я хочу|я могу|я не|у меня|у вас|божья|с приездом|в добрый|счастлив|с праздником|поздравляю|желаю|будьте|есть ли|где здесь|куда|откуда|не могли|вы не|могу ли|разрешите|покажите|посмотрите|подождите|подойдите|напишите|говорите|понимаете|знаете|зовут|фамилия|отчество|переводчик|телефон|билет|поезд|автобус|гостиниц|номер|ресторан|счет|туалет|магазин|больниц|врач|полици|аптек|вода|хлеб|мясо|чай|кофе|молоко|семья|мать|отец|брат|сестра|сын|дочь|ребенок|день|неделя|месяц|год|час|сегодня|завтра|вчера|зима|весна|лето|осень|погода|дождь|снег|ветер|тепло|холодно|жарко|благодар|конечно|помогу|передайте|тише|могу я|пусть ваш|пусть жизнь|большое спасибо)/i;

function looksLikeIngushText(text) {
  const t = normalizeSpace(text);
  if (t.length < 2) return false;
  if (/^(султыгова|разговорник|удк|ббк|ответ|приветствие)$/i.test(t)) return false;
  if (RU_STARTERS.test(t)) return false;
  if (/[ьъӀ1]/i.test(t)) return true;
  if (/[гкхтпч]I|[гкхтпч]Ӏ|г1|к1|х1|т1|п1|ч1|къ|хь|гъ|Iа|Iо/i.test(t)) return true;
  if (/^(сона|со|хьо|хьа|хьона|туйре|марш|диканца|баркал|дика|ираз|фу|мича|аз|салам|болх|дукха|укхаз|мегар|мегад|хетт|хетар|воалар|кхет|мотт|галг|палг)/i.test(t)) {
    return true;
  }
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const cyr = (t.match(/[а-яё]/gi) || []).length;
  if (latin >= 3 && latin > cyr) return true;
  if (cyr >= 3 && /[!?]/.test(t) && !/^(как|что|где|когда|это|все|мне|вам|вас|тебя|меня)\b/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeRuSegment(text) {
  const t = normalizeSpace(text);
  if (!t || t.length < 2) return false;
  if (!/[а-яё]/i.test(t)) return false;
  if (/^[А-ЯЁ\s]{3,}$/.test(t)) return false;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (latin > t.length * 0.35) return false;
  if (/^(от составителя|к сведению|классы существительного)$/i.test(t)) return false;
  return true;
}

function cleanOcrLine(line) {
  return normalizeSpace(
    (line || "")
      .replace(/[©®`\\|]/g, " ")
      .replace(/\bpage\s+\d+\b/gi, " ")
      .replace(/М\.?\s*М\.?\s*Султыгова/gi, " ")
      .replace(/Русско[- ]?ингушск\w*\s+разговорник/gi, " ")
      .replace(/\b\d{1,3}\s*$/g, " ")
      .replace(/\s+/g, " ")
  );
}

function fixIngOrthography(ing) {
  return normalizeSpace(
    (ing || "")
      .replace(/ГТ/g, "ГӀ")
      .replace(/гТ/g, "гӀ")
      .replace(/Г1/g, "ГӀ")
      .replace(/г1/g, "гӀ")
      .replace(/п1/g, "пӀ")
      .replace(/П1/g, "ПӀ")
      .replace(/1/g, "Ӏ")
      .replace(/:+/g, "")
      .replace(/\s+([!?.,])/g, "$1")
      .replace(/[`´]/g, "")
  );
}

function cleanRuPhrase(ru) {
  let t = normalizeSpace(ru.replace(/^[—\-–]+/, ""));
  t = t.replace(/^(приветствие|ответ|вопрос)\s+/i, "");
  if (t.endsWith(",") && t.length < 40) t = t.slice(0, -1).trim();
  return t;
}

function detectSectionHeader(line) {
  const upper = line.toUpperCase();
  for (const header of SECTION_HEADERS.sort((a, b) => b.length - a.length)) {
    if (upper.includes(header)) return header;
  }
  return "";
}

function stripSectionFromLine(line, section) {
  if (!section) return line;
  const re = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return normalizeSpace(line.replace(re, " "));
}

function isGarbageRu(ru) {
  const t = cleanRuPhrase(ru);
  if (!t || t.length < 2) return true;
  if (/^\([^)]*$/.test(t) || /^\(.*\)$/.test(t)) return true;
  if (/^(ответ|к одному|к двум|к предст|мужчине|женщине|приветствие|работающему|вас\)|тебя\))/i.test(t)) return true;
  if ((t.match(/[A-Za-z]/g) || []).length > t.length * 0.2) return true;
  if (/[<>{}[\]|\\^~]/.test(t)) return true;
  if (/\.{3,}/.test(t)) return true;
  if (/[а-яё]/i.test(t) && /[a-z]/i.test(t) && t.split(/\s+/).length <= 3) return true;
  return false;
}

function isRussianPhrase(text) {
  const t = cleanRuPhrase(text);
  if (!looksLikeRuSegment(t)) return false;
  if (isGarbageRu(t)) return false;
  if (RU_STARTERS.test(t)) return true;
  if (/[щЩэЭыЫ]/.test(t)) return true;
  if (/\b(ли|бы|был|была|его|ее|их|наш|ваш|этот|эта|эти|тот|та|те|или|если|чтобы|чтобы|через|после|перед)\b/i.test(t)) {
    return !looksLikeIngushText(t);
  }
  return t.split(/\s+/).length >= 2 && !looksLikeIngushText(t);
}

function splitClauses(line) {
  return line
    .split(/(?<=[!?])(?=\s+[А-ЯЁ«"(—\-])|(?<=[.])(?=\s+[А-ЯЁ«"(—\-])/)
    .map((c) => normalizeSpace(c))
    .filter((c) => c.length >= 2);
}

function splitClausesLoose(line) {
  return (line.match(/[^!?.]+[!?.]?/g) || [])
    .map((c) => normalizeSpace(c))
    .filter((c) => c.length >= 2);
}

function ingHasRussianBleed(ing) {
  const t = normalizeText(ing);
  return /(с приездом|пусть |будь |как |вы |мне |добро|это |все |можно |нужно |где |когда |кто |что )/.test(t);
}

function extractRussianOnly(ru) {
  const words = (ru || "").split(/\s+/).filter(Boolean);
  const keep = [];
  for (const w of words) {
    if (looksLikeIngushText(w) && keep.length >= 2) break;
    if (/^(болх|хилба|беркате|мегар|дуькха|хьа|хьо|сона|со)$/i.test(w) && keep.length >= 2) break;
    keep.push(w);
  }
  return cleanRuPhrase(keep.join(" "));
}

function walkClauseParts(parts, section, out, seen) {
  let i = 0;
  while (i < parts.length) {
    if (!isRussianPhrase(parts[i])) {
      i += 1;
      continue;
    }
    const ru = extractRussianOnly(cleanRuPhrase(parts[i]));
    i += 1;
    const tail = [];
    while (i < parts.length && !isRussianPhrase(parts[i])) {
      tail.push(parts[i]);
      i += 1;
    }
    if (!tail.length) continue;

    const rawIng = tail[tail.length - 1];
    const ing = fixIngOrthography(rawIng);
    const pron = tail.length >= 2 ? normalizeSpace(tail[tail.length - 2]) : "";

    if (!isUsableRu(ru, { maxRuLen: 140, maxRuWords: 18 })) continue;
    if (!looksLikeIngushText(ing)) continue;
    if (isGarbageRu(ru)) continue;
    if (ingHasRussianBleed(ing)) continue;
    if (/^(султыгова|разговорник|удк|ббк)$/i.test(ru)) continue;

    const key = `${ru.toLowerCase()}|${ing.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ru, ing, pron, section });
  }
}

function parseVocabFromLine(line) {
  const cleaned = cleanOcrLine(line);
  if (!cleaned || cleaned.length < 5) return null;

  const section = detectSectionHeader(cleaned);
  const workLine = stripSectionFromLine(cleaned, section).replace(/\(.*?\)/g, " ").trim();
  const words = workLine.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 6) return null;
  if (/[!?.]/.test(workLine)) return null;

  const ru = words[0];
  if (!/^[А-ЯЁ][а-яё\-]{1,28}$/.test(ru)) return null;
  if (looksLikeIngushText(ru)) return null;
  if (!/^(брат|сестра|мать|отец|сын|дочь|ребенок|дитя|мужчина|женщина|мальчик|девочка|хлеб|вода|мясо|молоко|чай|кофе|масло|сыр|рыба|яблоко|зима|весна|лето|осень|часы|минута|час|год|день|неделя|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|утро|вечер|ночь|товарищ|парень|гость|друг|друзья|лошадь|баран|корова|собака|кошка|птица|рука|нога|голова|глаз|зуб|ноготь|одежда|пальто|юбка|ложка|тарелка|стол|стул|дом|город|село|дорога|машина|поезд|самолет|билет|деньги|рубль|магазин|рынок|больница|врач|аптека|школа|учитель|работа|спорт|интернет|телефон|погода|дождь|снег|ветер|солнце|луна|звезда|огонь|река|гора|поле|лес|цветок|дерево|овощ|фрукт|виноград|арбуз|тыква|картофель|морковь|лук|чеснок|перец|соль|сахар|мед|масло|слива|вишня|груша|орех|фундук|курица|яйцо|суп|каша|хлеб|сыворотка|колбаса|сметана|творог|булка|печенье)$/i.test(ru)) {
    return null;
  }

  const ing = fixIngOrthography(words[words.length - 1]);
  const pron = words.length >= 3 ? normalizeSpace(words.slice(1, -1).join(" ")) : "";
  if (!ing || ing.length < 2) return null;
  if (!looksLikeIngushText(ing) && !/^[A-Za-zА-Яа-яёӀ]{2,}$/.test(ing)) return null;

  return { ru, ing, pron, section };
}

function parsePhrasesFromLine(line) {
  const out = [];
  const cleaned = cleanOcrLine(line);
  if (!cleaned || cleaned.length < 6 || !/[а-яё]/i.test(cleaned)) return out;

  const section = detectSectionHeader(cleaned);
  const workLine = stripSectionFromLine(cleaned, section);
  const seen = new Set();

  const partsSmart = splitClauses(workLine);
  const partsLoose = splitClausesLoose(workLine);

  if (!partsSmart.length && !partsLoose.length) {
    const vocab = parseVocabFromLine(line);
    if (vocab) out.push(vocab);
    return out;
  }

  if (partsSmart.length) walkClauseParts(partsSmart, section, out, seen);
  if (partsLoose.length) walkClauseParts(partsLoose, section, out, seen);

  if (!out.length) {
    const vocab = parseVocabFromLine(line);
    if (vocab) out.push(vocab);
  }

  return out;
}

function parseSultygovaText(text) {
  const pages = (text || "").split(/--- page (\d+) ---/);
  const phrases = [];
  const seen = new Set();
  let currentSection = "misc";
  let currentCategory = "misc";

  for (let i = 1; i < pages.length; i += 2) {
    const pageNum = Number(pages[i]) || 0;
    const body = pages[i + 1] || "";
    if (pageNum <= SKIP_PAGE_MAX) continue;

    for (const rawLine of body.split("\n")) {
      const line = cleanOcrLine(rawLine);
      if (!line) continue;

      const header = detectSectionHeader(line);
      if (header && line.length < header.length + 80) {
        currentSection = header;
        currentCategory = SECTION_TO_CATEGORY[header] || slugSection(header);
        continue;
      }

      const linePhrases = parsePhrasesFromLine(line);
      for (const item of linePhrases) {
        const section = item.section || currentSection;
        const category = SECTION_TO_CATEGORY[section] || currentCategory;
        const key = `${item.ru.toLowerCase()}|${item.ing.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        phrases.push({
          ru: item.ru,
          ing: item.ing,
          pron: item.pron,
          section,
          category,
          page: pageNum
        });
      }
    }
  }

  return {
    phrases,
    stats: {
      total: phrases.length,
      sections: [...new Set(phrases.map((p) => p.section))].length,
      categories: [...new Set(phrases.map((p) => p.category))]
    }
  };
}

module.exports = {
  parseSultygovaText,
  parsePhrasesFromLine,
  fixIngOrthography,
  looksLikeIngushText,
  SECTION_HEADERS,
  SECTION_TO_CATEGORY
};
