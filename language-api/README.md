# LanguageAPI (MVP)

Backend for the Ingush language platform.

## Run

```bash
node language-api/server.js
```

Optional env:

- `PORT` (default: `8787`)
- `GEMINI_API_KEY` (used only for LLM fallback)

## Contracts

- `GET /health`
- `GET /lookup/word?ru=<text>`
- `GET /lookup/phrase?ru=<text>`
- `GET /lookup/corpus?q=<text>`
- `POST /translate` body: `{ "ru": "..." }`
- `GET /metrics`
- `GET /moderation/pending`
- `POST /refresh`

`/translate` response:

```json
{
  "ok": true,
  "translation": "Со мал безам ба",
  "usedSource": "dosh",
  "confidence": 1,
  "fallbackUsed": false
}
```

Pipeline order:

1. `dosh` exact match
2. `grammar` pattern/rule/lexeme match
3. `habar` phrase match
4. `dosh` token composition fallback (for short phrases)
5. LLM fallback
6. validation + moderation queue on reject

## Data Sources

- Dictionary: `https://dosh.inghub.ru/public/dictionary.json` (fallback raw GitHub)
- Phrase store: local `ingush-phrasebook-main/categories/*.json`
- Corpus store:
  - `language-api/data/corpus/stories/*.json`
  - `language-api/data/corpus/novellas/*.json`
- Grammar store (MVP scaffold):
  - `language-api/data/grammar/patterns.json`
  - `language-api/data/grammar/rules.json`
  - `language-api/data/grammar/lexemes.json`
  - `language-api/data/grammar/declensions.json`

