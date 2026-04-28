# SpyBot

OSINT-style profile research, mobile-first. Type or photograph a list of names and SpyBot pulls together a research dossier — current activity, career timeline, conversation hooks, and a glossary for unfamiliar terms.

**Live:** [bm-cs-2026.github.io/SpyBot](https://bm-cs-2026.github.io/SpyBot/)

## How it works
- Runs entirely in the browser as a PWA
- Calls Claude (`claude-sonnet-4-5`) with the `web_search` tool
- Vision (Claude multimodal) extracts names from a screenshot/photo
- Profiles persist in `localStorage`
- Anthropic API key stored locally on device

## First-time setup
1. Open the live URL on your phone
2. Tap ⚙ → paste your Anthropic API key (from `console.anthropic.com`)
3. Type names or hit "Scan Image" to capture a list

## Local dev
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Architecture
| File | Role |
|---|---|
| `index.html` | Single-page shell with view templates |
| `js/app.js` | Router + UI controller |
| `js/api.js` | Anthropic API client (browser-direct) |
| `js/research.js` | Research prompt + JSON extraction |
| `js/vision.js` | Name extraction from images |
| `js/render.js` | Profile rendering |
| `js/storage.js` | localStorage persistence |
| `css/styles.css` | Spy/Data Spy theme |
| `sw.js` | PWA service worker (offline shell) |
