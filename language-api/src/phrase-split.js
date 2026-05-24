const MAX_RU_LEN = 100;
const MAX_RU_WORDS = 12;

function isUsableShortRu(text) {
  const t = (text || "").trim();
  if (!t || t.length > MAX_RU_LEN) return false;
  if (t.split(/\s+/).length > MAX_RU_WORDS) return false;
  if (!/[а-яё]/i.test(t)) return false;
  if (/^[-–—]+$/.test(t)) return false;
  if (/^урок\s*\d/i.test(t)) return false;
  if (/^главные слова/i.test(t)) return false;
  if (/^\d+\)\s/.test(t)) return false;
  if (/^\d+\s+\S+,\s*\d+\s/.test(t)) return false;
  return true;
}

function cleanRuFragment(value) {
  return (value || "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/^[«"'\s]+|[»"'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitOnPunctuation(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitRuIngPairs(ru, ing) {
  const ruText = (ru || "").toString().trim();
  const ingText = (ing || "").toString().trim();
  if (!ruText || !ingText) return [];

  const ruParts = splitOnPunctuation(ruText).map(cleanRuFragment);
  const ingParts = splitOnPunctuation(ingText);

  if (ruParts.length > 1 && ruParts.length === ingParts.length) {
    return ruParts
      .map((part, index) => ({ ru: part, ing: ingParts[index] }))
      .filter((pair) => isUsableShortRu(pair.ru) && pair.ing);
  }

  if (isUsableShortRu(ruText)) {
    return [{ ru: cleanRuFragment(ruText), ing: ingText }];
  }

  return [];
}

module.exports = {
  MAX_RU_LEN,
  MAX_RU_WORDS,
  isUsableShortRu,
  splitRuIngPairs
};
