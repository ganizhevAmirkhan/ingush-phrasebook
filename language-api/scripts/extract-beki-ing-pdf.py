# -*- coding: utf-8 -*-
"""Extract Ingush text layer from Bokov PDF and save as .txt"""
from __future__ import annotations

import re
from pathlib import Path

import fitz

PDF = Path(r"C:\Users\admin\Desktop\Iаи-бIаьстии-вIашагIкъасташ-ING.pdf")
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "external" / "synovya-beki"
DESKTOP = Path.home() / "Desktop" / "Iаи-бIаьстии-вIашагIкъасташ-ING.txt"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "ing-iai-biastii.txt"


def clean_page(text: str) -> str:
    text = text.replace("\xad", "")  # soft hyphen
    text = text.replace("\u00a0", " ")
    # join hyphenated line breaks: "хоад- \nдаме" -> "хоаддаме" is wrong;
    # keep soft reflow: word-\nword -> wordword only when ASCII hyphen at EOL
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> None:
    doc = fitz.open(PDF)
    pages: list[str] = []
    empty = 0
    total_chars = 0
    for i, page in enumerate(doc):
        raw = page.get_text("text") or ""
        cleaned = clean_page(raw)
        if len(cleaned) < 30:
            empty += 1
            continue
        pages.append(cleaned)
        total_chars += len(cleaned)
        if i < 3 or i in (20, 21, 50) or i == doc.page_count - 1:
            print(f"page {i}: {len(cleaned)} chars")
    text = "\n\n".join(pages) + "\n"
    # normalize weird spaces
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    OUT.write_text(text, encoding="utf-8")
    DESKTOP.write_text(text, encoding="utf-8")
    print(f"pages_total={doc.page_count} kept={len(pages)} emptyish={empty}")
    print(f"chars={len(text)}")
    print(f"wrote {OUT}")
    print(f"wrote {DESKTOP}")
    print("--- HEAD ---")
    print(text[:500])
    print("--- SAMPLE p20ish ---")
    # find a dense ingush sample
    m = re.search(r".{0,80}Хезар-те.{0,200}", text)
    if m:
        print(m.group(0))


if __name__ == "__main__":
    main()
