# LanguageAPI (MVP)

Backend for the Ingush language platform.

## Run

```bash
node language-api/server.js
```

Optional env:

- `PORT` (default: `8787`)
- `OPENROUTER_API_KEY` — **recommended on RU VPS** (LLM via openrouter.ai, bypasses Gemini geo block)
- `OPENROUTER_MODEL` (default: `google/gemini-2.0-flash-exp:free`)
- `OPENROUTER_SITE_URL` (default: `https://api.inghub.ru`)
- `OPENROUTER_APP_NAME` (default: `Ingush LanguageAPI`)
- `GEMINI_API_KEY` — fallback LLM if OpenRouter is not set
- `ADMIN_SECRET` (password for web admin panel)

## Admin panel

Web UI for grammar, lexemes, dialogues, blacklist:

```
http://localhost:8787/admin
```

Production:

```
https://api.inghub.ru/admin
```

Set on VPS in `.env`:

```
ADMIN_SECRET=your_long_random_password
```

Then restart PM2. Log in with this password in the admin panel.

Features:

- Grammar patterns (add / edit / delete)
- Lexemes (word forms)
- Corpus: dialogues, lessons, stories (edit or upload JSON)
- Blacklist
- Translate test
- Reload data after changes (automatic on save)

## Contracts

- `GET /health`
- `GET /health/llm` — test OpenRouter/Gemini connection
- `GET /health/gemini` — test Gemini only (legacy)
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

1. `dosh` exact match (single words)
2. `grammar` pattern/rule/lexeme match
3. `paydadosh` / `habar` / `corpus` phrase match
4. `dosh` token composition fallback (for short phrases)
5. LLM fallback
6. validation + moderation queue on reject

Import PaydaDosh phrases:

```bash
node language-api/scripts/import-paydadosh.js
```

## Data Sources

- Dictionary: `https://dosh.inghub.ru/public/dictionary.json` (fallback raw GitHub)
- Phrase store:
  - local `categories/*.json` (habar)
  - `language-api/data/colloquial/paydadosh-phrases.json` (PaydaDosh import)
  - lesson/dialogue pairs from corpus stories
- Corpus store:
  - `language-api/data/corpus/stories/*.json`
  - `language-api/data/corpus/novellas/*.json`
- Grammar store (MVP scaffold):
  - `language-api/data/grammar/patterns.json`
  - `language-api/data/grammar/rules.json`
  - `language-api/data/grammar/lexemes.json`
  - `language-api/data/grammar/declensions.json`

