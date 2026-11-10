# -*- coding: utf-8 -*-
"""Extract Ingush Беке къонгаш and align with Russian Сыновья Беки (Ashik-style pairs)."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "data" / "external" / "synovya-beki"
CORPUS = ROOT / "data" / "corpus" / "stories" / "synovya-beki.json"
DESKTOP = Path.home() / "Desktop"

PDF = DESKTOP / "Беке-къонгаш-ING.pdf"
RU_TXT = DESKTOP / "Сыновья-Беки-RU.txt"
ING_TXT = DESKTOP / "Беке-къонгаш-ING.txt"
REVIEW = DESKTOP / "Сыновья-Беки-RU-ING-пары.txt"

# Shared proper names / anchors (ru_form, ing_forms)
ANCHORS = [
    ("Беки", ["Беки", "Беке"]),
    ("Кайпа", ["Кайпа", "Кайпас", "Кайпага"]),
    ("Исмаал", ["ИсмаӀал", "Исма1ал", "Исмаал"]),
    ("Хасан", ["Хьасан", "Хасан"]),
    ("Хусен", ["Хьусен", "Хусен", "Хьусена"]),
    ("Саад", ["Саьд", "Саад", "Саьдакъ"]),
    ("Угром", ["Угром", "Угромах"]),
    ("Мазай", ["Мазай", "Мазайх"]),
]


def extract_pdf(pdf: Path) -> str:
    doc = fitz.open(pdf)
    pages: list[str] = []
    for page in doc:
        raw = page.get_text("text") or ""
        raw = raw.replace("\xad", "")
        if len(raw.strip()) < 40:
            continue
        raw = re.sub(r"(?m)^(?:[А-ЯЁӀA-Z]\s+){3,}[А-ЯЁӀA-Z]\s*$", "", raw)
        raw = re.sub(r"(\w)-\n(\w)", r"\1\2", raw)
        raw = re.sub(r"[ \t]*\n[ \t]*", " ", raw)
        raw = re.sub(r"(\w)-\s+(\w)", r"\1\2", raw)  # хин- на
        raw = re.sub(r" {2,}", " ", raw)
        pages.append(raw.strip())
    text = "\n\n".join(pages)
    m = re.search(r"Сецца\s+Ӏуйра\s+ламаза\s+Беки", text)
    if m:
        text = text[m.start() :]
    for end in ("СОДЕРЖАНИЕ", "ОГЛАВЛЕНИЕ"):
        j = text.rfind(end)
        if j > len(text) * 0.85:
            text = text[:j]
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def split_sentences(text: str) -> list[str]:
    text = text.replace("\r", "").replace("…", "...")
    parts = re.split(r"(?<=[.!?])\s+|(?<=\.\.\.)\s+", text)
    out: list[str] = []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip().strip("\"«»")
        if len(p) < 10:
            continue
        if re.fullmatch(r"[\d\-—–\s.]+", p):
            continue
        out.append(p)
    return out


def match_score(len_ru: float, len_ing: float, c: float) -> float:
    s2 = 6.8
    mean = c * len_ru
    if mean <= 1:
        return -1e9
    delta = (len_ing - mean) / math.sqrt(max(len_ru, 1) * s2 * abs(c))
    return -(delta * delta)


def align_sentences(ru: list[str], ing: list[str]) -> list[tuple[str, str]]:
    if not ru or not ing:
        return []
    c = (sum(len(x) for x in ing) / len(ing)) / max(sum(len(x) for x in ru) / len(ru), 1.0)
    n, m = len(ru), len(ing)
    NEG = -1e18
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bt: list[list[tuple[int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0

    def lensum(xs: list[str], i: int, k: int) -> float:
        return float(sum(len(xs[i + t]) for t in range(k)))

    for i in range(n + 1):
        for j in range(m + 1):
            cur = dp[i][j]
            if cur <= NEG / 2:
                continue
            if i < n and j < m:
                sc = cur + match_score(len(ru[i]), len(ing[j]), c)
                if sc > dp[i + 1][j + 1]:
                    dp[i + 1][j + 1] = sc
                    bt[i + 1][j + 1] = (1, 1)
            if i < n and j + 1 < m:
                sc = cur + match_score(len(ru[i]), lensum(ing, j, 2), c) - 1.0
                if sc > dp[i + 1][j + 2]:
                    dp[i + 1][j + 2] = sc
                    bt[i + 1][j + 2] = (1, 2)
            if i + 1 < n and j < m:
                sc = cur + match_score(lensum(ru, i, 2), len(ing[j]), c) - 1.0
                if sc > dp[i + 2][j + 1]:
                    dp[i + 2][j + 1] = sc
                    bt[i + 2][j + 1] = (2, 1)
            if i < n:
                sc = cur - 2.5
                if sc > dp[i + 1][j]:
                    dp[i + 1][j] = sc
                    bt[i + 1][j] = (1, 0)
            if j < m:
                sc = cur - 2.5
                if sc > dp[i][j + 1]:
                    dp[i][j + 1] = sc
                    bt[i][j + 1] = (0, 1)

    pairs: list[tuple[str, str]] = []
    i, j = n, m
    while i > 0 or j > 0:
        step = bt[i][j]
        if step is None:
            break
        di, dj = step
        ru_chunk = " ".join(ru[i - di : i]) if di else ""
        ing_chunk = " ".join(ing[j - dj : j]) if dj else ""
        if ru_chunk and ing_chunk:
            pairs.append((ru_chunk, ing_chunk))
        i -= di
        j -= dj
    pairs.reverse()
    return pairs


def find_anchor_positions(sents: list[str], variants: list[str]) -> list[int]:
    positions = []
    for i, s in enumerate(sents):
        for v in variants:
            if v in s:
                positions.append(i)
                break
    return positions


def build_sync_points(ru: list[str], ing: list[str]) -> list[tuple[int, int]]:
    """Return sorted (ru_idx, ing_idx) sync anchors including start/end."""
    points = [(0, 0)]
    # Collect occurrence lists per name
    for ru_name, ing_vars in ANCHORS:
        ru_pos = find_anchor_positions(ru, [ru_name])
        ing_pos = find_anchor_positions(ing, ing_vars)
        # greedy match occurrences in order with similar relative progress
        j = 0
        for rp in ru_pos:
            best = None
            best_score = 1e18
            ru_frac = rp / max(len(ru), 1)
            for k in range(j, len(ing_pos)):
                ip = ing_pos[k]
                ing_frac = ip / max(len(ing), 1)
                score = abs(ru_frac - ing_frac)
                # allow only if reasonably close in relative position
                if score < best_score and score < 0.08:
                    best_score = score
                    best = (k, ip)
            if best is not None:
                points.append((rp, best[1]))
                j = best[0] + 1
    points.append((len(ru), len(ing)))
    # sort + unique increasing
    points.sort()
    synced: list[tuple[int, int]] = [(0, 0)]
    for rp, ip in points[1:]:
        pr, pi = synced[-1]
        if rp > pr and ip > pi:
            synced.append((rp, ip))
        elif rp >= pr and ip >= pi and (rp, ip) != (pr, pi):
            # replace if both non-decreasing and farther
            if rp > pr or ip > pi:
                synced[-1] = (max(pr, rp), max(pi, ip))
    if synced[-1] != (len(ru), len(ing)):
        synced.append((len(ru), len(ing)))
    return synced


def align_chunk(ru: list[str], ing: list[str], limit: int = 300) -> list[tuple[str, str]]:
    """Align a segment; if too large, split proportionally in half."""
    if not ru or not ing:
        return []
    if len(ru) <= limit and len(ing) <= limit + 80:
        return align_sentences(ru, ing)
    # proportional midpoint split
    mid_r = len(ru) // 2
    mid_i = max(1, min(len(ing) - 1, int(len(ing) * (mid_r / len(ru)))))
    return align_chunk(ru[:mid_r], ing[:mid_i], limit) + align_chunk(ru[mid_r:], ing[mid_i:], limit)


def align_all(ru: list[str], ing: list[str]) -> list[tuple[str, str]]:
    sync = build_sync_points(ru, ing)
    print(f"sync points: {len(sync)}")
    pairs: list[tuple[str, str]] = []
    for a, b in zip(sync, sync[1:]):
        r0, i0 = a
        r1, i1 = b
        ru_chunk = ru[r0:r1]
        ing_chunk = ing[i0:i1]
        if not ru_chunk or not ing_chunk:
            continue
        chunk_pairs = align_chunk(ru_chunk, ing_chunk)
        pairs.extend(chunk_pairs)
        print(f"  block RU[{r0}:{r1}] ING[{i0}:{i1}] -> {len(chunk_pairs)} pairs")
    return pairs


def main() -> None:
    EXT.mkdir(parents=True, exist_ok=True)
    print("Extracting PDF…")
    ing_text = extract_pdf(PDF)
    ING_TXT.write_text(ing_text, encoding="utf-8")
    (EXT / "ing-beke-kongash.txt").write_text(ing_text, encoding="utf-8")
    print(f"ING chars={len(ing_text)}")

    ru_text = RU_TXT.read_text(encoding="utf-8")
    ru_sents = split_sentences(ru_text)
    ing_sents = split_sentences(ing_text)
    print(f"RU sents={len(ru_sents)} ING sents={len(ing_sents)}")
    print("RU0:", ru_sents[0][:100])
    print("ING0:", ing_sents[0][:120])

    pairs_raw = align_all(ru_sents, ing_sents)

    dedup: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for ru, ing in pairs_raw:
        ru = ru.strip()
        ing = re.sub(r"\s+", " ", ing).strip()
        if len(ru) < 10 or len(ing) < 8:
            continue
        key = (ru.lower(), ing.lower())
        if key in seen:
            continue
        seen.add(key)
        dedup.append({"ru": ru, "ing": ing})

    story = {
        "id": "story_synovya_beki_001",
        "title": "Сыновья Беки",
        "titleIng": "Беке къонгаш",
        "level": "B2",
        "genre": "novella",
        "authorRu": "А. Х. Боков",
        "translator": "оригинал ингушский (OCR 1991) / рус. пер. Р. Кафриэлянц",
        "source": "beke-kongash-1991-pdf + groznycity-ru",
        "note": "Черновое автовыравнивание; нужна ручная правка.",
        "paragraphs": dedup,
    }
    CORPUS.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (EXT / "synovya-beki-aligned.json").write_text(
        json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    lines = [
        "Сыновья Беки / Беке къонгаш",
        "Формат как у Ашика: сверху русский, снизу ингушский.",
        "Черновик автосопоставления — проверьте и поправьте.",
        f"Всего пар: {len(dedup)}",
        "=" * 60,
        "",
    ]
    for i, p in enumerate(dedup, 1):
        lines.append(p["ru"])
        lines.append(p["ing"])
        lines.append("")
    REVIEW.write_text("\n".join(lines), encoding="utf-8")

    print(f"pairs={len(dedup)}")
    print(f"review={REVIEW}")
    print(f"corpus={CORPUS}")
    print("--- first 8 ---")
    for p in dedup[:8]:
        print(p["ru"][:110])
        print(p["ing"][:110])
        print()


if __name__ == "__main__":
    main()
