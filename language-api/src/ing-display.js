/**
 * Нормализация перевода для отображения: латинская фонетика → кириллица.
 * LLM иногда отдаёт næstæræš вместо настараж или когаш.
 */

function sanitizeLlmOutput(text) {
  return (text || "")
    .toString()
    .replace(/<pad>/gi, "")
    .replace(/<\|[^|>]*\|>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasIngushCyrillic(text) {
  const t = (text || "").toString();
  if (!/[а-яё]/i.test(t)) return false;
  if (/[гдтпкбвзсш]1|хь|Ӏ|ӏ|аь|оь|уь|яь|ий/i.test(t)) return true;
  if (/[А-ЯЁа-яёІіҢңҮүӨөҺһ]/.test(t) && t.length >= 2) return true;
  return false;
}

function looksLikePhoneticLatin(text) {
  const t = (text || "").toString();
  if (!t || hasIngushCyrillic(t)) return false;
  if (/[æøəåäöüıİşŞšŽžČčĞğʻʼʃʒɨɑ]/.test(t)) return true;
  if (!/^[a-z0-9\s'`".,!?;:()\-]+$/i.test(t)) return false;
  if (/[gdtpk]1|gh1|kh1|h'|ts1|ch1|sh1/i.test(t)) return false;
  return /[a-z]{2,}/i.test(t);
}

const PHONETIC_LATIN_PIECES = [
  ["æræš", "араж"],
  ["tʃ", "ч"],
  ["ch", "ч"],
  ["č", "ч"],
  ["sh", "ш"],
  ["š", "ж"],
  ["ʃ", "ж"],
  ["zh", "ж"],
  ["ž", "ж"],
  ["ʒ", "ж"],
  ["kh", "х"],
  ["gh", "г"],
  ["ng", "нг"],
  ["æ", "а"],
  ["ə", "а"],
  ["ä", "а"],
  ["å", "а"],
  ["ö", "ё"],
  ["ü", "ю"],
  ["ı", "ы"],
  ["a", "а"],
  ["b", "б"],
  ["c", "к"],
  ["d", "д"],
  ["e", "е"],
  ["f", "ф"],
  ["g", "г"],
  ["h", "х"],
  ["i", "и"],
  ["j", "й"],
  ["k", "к"],
  ["l", "л"],
  ["m", "м"],
  ["n", "н"],
  ["o", "о"],
  ["p", "п"],
  ["q", "к"],
  ["r", "р"],
  ["s", "с"],
  ["t", "т"],
  ["u", "у"],
  ["v", "в"],
  ["w", "в"],
  ["x", "кс"],
  ["y", "й"],
  ["z", "з"]
];

function latinPhoneticToCyrillic(text) {
  const t = (text || "").toString().toLowerCase();
  let out = "";
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (/[\s.,!?;:()\-]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    let matched = false;
    for (const [lat, cyr] of PHONETIC_LATIN_PIECES) {
      if (t.startsWith(lat, i)) {
        out += cyr;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += ch;
      i += 1;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function normalizeIngDisplay(text) {
  const cleaned = sanitizeLlmOutput(text);
  if (!cleaned) return "";
  if (hasIngushCyrillic(cleaned)) return cleaned;
  if (looksLikePhoneticLatin(cleaned)) {
    return latinPhoneticToCyrillic(cleaned);
  }
  return cleaned;
}

module.exports = {
  sanitizeLlmOutput,
  normalizeIngDisplay,
  latinPhoneticToCyrillic,
  looksLikePhoneticLatin,
  hasIngushCyrillic
};
