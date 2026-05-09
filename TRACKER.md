# Hugin MCP — Roadmap : le Search + Reader ultime pour l'agentic

## Philosophie
- **100% local, 100% gratuit** — zéro API payante, zéro clé obligatoire
- **Self-hosted first** — SearXNG, Puppeteer, LM Studio tournent en local
- **Fast by default** — cache SQLite, readers spécialisés par domaine, warm pool
- **Fallback chain** — API dédiée → Readability → Puppeteer → ReaderLM

---

## ✅ Déjà implémenté (v8.0)

### 🔍 Search
- [x] SearXNG (aggrège Google, Bing, DuckDuckGo, Brave, Startpage, +70 engines)
- [x] Bing scraping fallback (quand Docker indisponible)
- [x] Dedup résultats, cache 24h, retry sur 429

### 📖 Readers spécialisés (14)
- [x] **GitHub** — REST API (issues, PRs, repos, fichiers) — 60 req/h sans auth
- [x] **Reddit** — JSON API (posts + commentaires) + old.reddit.com (subreddits)
- [x] **YouTube** — Innertube API (transcripts avec timestamps)
- [x] **HackerNews** — Firebase API (stories + comments)
- [x] **StackExchange** — API publique (300+ sites Q&A)
- [x] **Wikipedia** — MediaWiki API (155k→5k chars, 30x réduction)
- [x] **ArXiv** — HTML scraping meta tags (titre, auteurs, abstract)
- [x] **MDN** — index.json API (documentation structurée)
- [x] **npm** — Registry API (metadata + README)
- [x] **Docker Hub** — v2 API (pulls, tags, tailles)
- [x] **PDF** — pdf-parse (extraction texte pur JS)

### 🛠️ Infrastructure
- [x] SQLite cache 24h
- [x] Batch parallel reads `urls[]`
- [x] Puppeteer fallback + warm pool (SPA/403)
- [x] ReaderLM-v2 optionnel (`llm=true`)
- [x] GFM tables, cookie banner dismiss, rate-limit retry
- [x] Architecture modulaire (23 modules, SOLID)
- [x] Multi-platform (Chrome auto-detect macOS/Linux/Windows/Brave/Edge)
- [x] Graceful degradation (no Chrome = works without Puppeteer)
- [x] Smoke tests (npm test → 7/7)

---

## 🔴 Tier 0 — Gaps critiques vs concurrents

> Features que la majorité de nos concurrents ont et qui nous manquent pour être crédibles.

### Inspiré de web-search-mcp (mrkrsl, 851⭐)
- [ ] **`full-web-search` — search + auto-read combiné** — Un seul appel qui retourne les résultats de recherche **avec le contenu des top N pages déjà extrait**. L'agent n'a pas besoin de faire search→read→read→read, tout arrive en un coup. Paramètres : `query`, `limit` (1-5), `includeContent` (bool).
  - **Qui l'a** : mrkrsl ✅, Tavily ✅, Firecrawl ✅
  - **Impact** : Réduit le nombre de tours agent de N+1 → 1
  - **Effort** : 30min (réutilise `handleSearch` + `readPage` en interne)

- [ ] **Quality scoring des résultats search** — Noter la pertinence des résultats retournés par chaque moteur (0 à 1). Si le score < seuil, essayer le moteur suivant. Évite de renvoyer des résultats de merde quand un moteur déraille.
  - **Qui l'a** : mrkrsl ✅ (Jaccard + seuil configurable)
  - **Méthode** : Jaccard similarity entre query terms et snippet/title, pondéré par la position
  - **Impact** : Fiabilité des résultats
  - **Effort** : 1h

- [ ] **Fingerprint randomization** — Randomiser viewport, timezone, locale, headers par requête Puppeteer pour éviter le fingerprinting. Notre User-Agent est actuellement fixe — c'est un signal fort de bot.
  - **Qui l'a** : mrkrsl ✅ (random viewport/timezone/locale/headers), Playwright MCP ✅
  - **Randomiser** : viewport (1280x720, 1366x768, 1440x900…), timezone, Accept-Language, headers secondaires
  - **Impact** : Bypass de certaines détections
  - **Effort** : 1h

### Inspiré de Jina MCP (673⭐) & Exa MCP (4.4k⭐)
- [ ] **Screenshot tool** — `web_screenshot` : Puppeteer screenshot → base64 PNG. Permet à l'agent de "voir" une page (graphs, charts, layouts, memes, UI).
  - **Qui l'a** : Jina ✅ (`capture_screenshot_url`), Playwright MCP ✅, Crawl4AI ✅
  - **Effort** : 20min (`page.screenshot({ encoding: 'base64' })`)
  - **Note** : Jina propose aussi `guess_datetime_url` (détecter la date de publication d'une page) — utile pour le search ranking

- [ ] **Dedup sémantique** — Filtrer les résultats de search qui pointent vers le même contenu (mirrors, reposts, agrégateurs). Jina utilise des embeddings + submodular optimization pour ça.
  - **Qui l'a** : Jina ✅ (`deduplicate_strings`, `deduplicate_images` via embeddings)
  - **Méthode** : SimHash (léger, pas besoin de LLM) ou MinHash pour les gros volumes
  - **Impact** : Résultats de search plus diversifiés, pas de doublons
  - **Effort** : 2h

- [ ] **Query expansion** — Reformuler/élargir la query de search pour mieux couvrir le sujet. Jina a `expand_query`, Exa fait du neural search.
  - **Qui l'a** : Jina ✅ (`expand_query` via modèle), Exa ✅ (neural search natif)
  - **Méthode** : SearXNG suggestions + synonymes simples (pas besoin de LLM)
  - **Impact** : Meilleure pertinence sur les queries vagues
  - **Effort** : 1h

- [ ] **Reranker** — Re-classer les résultats de search par pertinence par rapport à la query. Exa et Jina ont tous les deux un reranker.
  - **Qui l'a** : Jina ✅ (`sort_by_relevance` via reranker), Exa ✅ (neural ranking natif)
  - **Méthode locale** : cross-encoder `cross-encoder/ms-marco-MiniLM-L-6-v2` via ONNX (CPU, ~10ms/query)
  - **Impact** : Résultats beaucoup plus pertinents
  - **Effort** : 2h (modèle ONNX + intégration)

### Inspiré de Firecrawl MCP (6.3k⭐) & Tavily MCP (1.9k⭐)
- [ ] **Extraction structurée (JSON schema)** — Permettre à l'agent de demander "extrais les données de cette page selon ce schéma JSON". Firecrawl et Crawl4AI le font très bien.
  - **Qui l'a** : Firecrawl ✅ (LLM extraction avec schema), Crawl4AI ✅ (CSS/XPath/LLM extraction)
  - **Méthode** : Utiliser ReaderLM-v2 (déjà disponible) avec un prompt structuré, ou extraction par CSS selectors
  - **Impact** : L'agent peut extraire des données typées (prix, dates, noms, adresses…)
  - **Effort** : 2h

- [ ] **Deep research / multi-page crawl** — À partir d'une query, crawler automatiquement N pages en profondeur, suivre les liens pertinents, et agréger les résultats. Firecrawl (`/crawl`), Tavily (`crawl`), et Crawl4AI (`crawl`, `crawl_site`, `crawl_sitemap`) le font tous.
  - **Qui l'a** : Firecrawl ✅, Tavily ✅, Crawl4AI ✅ (crawl_site, crawl_sitemap), Exa ✅
  - **Méthode** : BFS depuis les résultats de search, lire chaque page, suivre les liens pertinents, limiter la profondeur
  - **Impact** : Recherche approfondie multi-sources en un seul appel
  - **Effort** : 3h

### Anti-détection
- [ ] **puppeteer-extra + stealth plugin** — Injecte des patches anti-détection (fingerprints, navigator, WebGL, etc.) pour bypass Cloudflare/PerimeterX. mrkrsl fait du random manuel, mais le stealth plugin est plus complet.
  - **Qui l'a** : mrkrsl ✅ (random manuel), Crawl4AI ✅ (stealth intégré)
  - **npm** : `puppeteer-extra`, `puppeteer-extra-plugin-stealth`
  - **Effort** : 1h

---

## 🟡 Tier 1 — Search & Extraction avancées

### Search
- [ ] **Google Custom Search JSON API** — 100 req/jour gratuit (nécessite un projet GCP gratuit, pas de carte bancaire). SearXNG l'utilise déjà indirectement, mais un accès direct donnerait des résultats plus propres et fiables.
  - **Impact** : Meilleure qualité de résultats, 100 req/j gratuites
  - **Effort** : 30min

- [ ] **Search by domain** — Paramètre `domains[]` dans SearXNG pour cibler des sites spécifiques (`site:github.com`). Déjà supporté par SearXNG, juste l'exposer dans le schema.
  - **Qui l'a** : Brave Search MCP ✅, Linkup ✅ (`includeDomains`/`excludeDomains`), Firecrawl ✅
  - **Effort** : 15min

- [ ] **Search by file type** — Paramètre `filetype:pdf` etc. dans SearXNG. Utile pour trouver des papers et des docs.
  - **Effort** : 15min

- [ ] **Related pages** — `web_related` : Trouver des pages similaires via `link:` query ou Google `related:` operator via SearXNG.
  - **Qui l'a** : Exa ✅ (neural similarity)
  - **Effort** : 30min

- [ ] **Trending topics** — Aggréger les trending topics de HN, Reddit, Twitter/Mastodon pour un sujet donné.
  - **Effort** : 2h

### Extraction & qualité
- [ ] **Smart truncation** — Au lieu de tronquer bêtement à N chars, découper intelligemment par sections (h2/h3) pour garder des blocs cohérents.
  - **Qui l'a** : Fetch MCP (official) ✅ (`start_index` pour le chunked reading)
  - **Effort** : 1h

- [ ] **Table extraction améliorée** — Les tables HTML complexes (merged cells, nested tables) sont mal converties par Turndown. Utiliser un parser dédié ou ReaderLM.
  - **Effort** : 1h

- [ ] **Code block preservation** — Les blocs de code avec coloration syntaxique sont souvent perdus. Détecter `<pre><code>` et préserver le contenu brut.
  - **Effort** : 30min

### Performance
- [ ] **Cache smarter** — TTL variable par source (API JSON=24h, HTML=1h, PDF=infini)
  - **Effort** : 2h

- [ ] **Request deduplication** — Si deux appels concurrents demandent la même URL, ne la fetch qu'une seule fois
  - **Effort** : 1h

- [ ] **Prefetch** — Après un search, pré-fetch les 3 premières URLs en background pour les avoir en cache quand l'agent les demande
  - **Effort** : 1h

---

## 🟢 Tier 2 — Expansion du coverage

### Readers critiques manquants
- [ ] **Substack** — RSS feed natif à `{substack}.substack.com/feed` → pas besoin d'HTML, juste parser l'XML
  - **Impact** : Newsletters tech très populaires
  - **npm** : `rss-parser` ou parsing XML natif
  - **Effort** : 30min

- [ ] **Google Scholar / Semantic Scholar** — Semantic Scholar a une API REST gratuite (pas de clé, 100 req/5min). Retourne titre, abstract, citations, auteurs, PDF link.
  - **Impact** : Recherche académique — le reader ultime pour les papers
  - **API** : `api.semanticscholar.org/graph/v1/paper/search?query=...`
  - **Qui l'a** : Jina ✅ (`search_arxiv`, `search_ssrn`, `search_bibtex`)
  - **Effort** : 1h

- [ ] **Medium** — Contenu souvent derrière paywall. Readability arrive parfois à extraire le contenu. Approche: Google cache URL ou proxy alternatif.
  - **Impact** : Beaucoup de contenu tech sur Medium
  - **Effort** : 1h (fragile, les paywalls changent souvent)

### Documentation technique
- [ ] **PyPI** — `pypi.org/pypi/{package}/json` (identique à npm mais pour Python). Retourne metadata + description + classifiers.
  - **Effort** : 30min

- [ ] **crates.io** — `crates.io/api/v1/crates/{name}` (Rust packages). API publique, JSON propre.
  - **Effort** : 30min

- [ ] **ReadTheDocs** — `readthedocs.org` expose un JSON API pour les projets documentés. URL pattern: `/{project}/{version}/{path}.json` ou le fichier `objects.inv`.
  - **Effort** : 1h

- [ ] **docs.rs** — Documentation Rust. `docs.rs/crate/{name}/{version}` scrapeable.
  - **Effort** : 45min

### Podcasts & RSS
- [ ] **Apple Podcasts transcripts** — Apple expose les transcripts via une API non documentée mais accessible. Le GitHub `dado3212/apple-podcast-transcripts` montre la méthode.
  - **Effort** : 2h (reverse engineering)

- [ ] **Podcast RSS** — Parser les feeds RSS des podcasts populaires pour obtenir les épisodes + liens vers audio/transcripts.
  - **npm** : `rss-parser`
  - **Effort** : 1h

- [ ] **RSS/Atom reader universel** — Parser tout feed RSS/Atom. Auto-détection via `<link rel="alternate" type="application/rss+xml">` dans le HTML.
  - **npm** : `rss-parser` ou parsing XML natif
  - **Effort** : 1h

### News & Media
- [ ] **Web Archive / Wayback Machine** — Quand une page est 404/paywall, fallback vers `web.archive.org/web/{timestamp}/{url}`. L'API Wayback `http://archive.org/wayback/available?url=...` retourne le dernier snapshot disponible en JSON.
  - **Impact** : Récupération de pages disparues ou modifiées
  - **Effort** : 45min

### Social
- [ ] **Mastodon / Fediverse** — API publique JSON. `mastodon.social/api/v1/accounts/{id}/statuses` ou recherche `api/v2/search?q=...`. Pas d'auth pour les contenus publics.
  - **Effort** : 1h

- [ ] **Bluesky** — API publique `bsky.social/xrpc/app.bsky.feed.searchPosts?q=...`. Pas d'auth pour la lecture publique. Format JSON propre.
  - **Effort** : 1h

### Agent-grade tools
- [ ] **PDF export** — `web_pdf` : Générer un PDF d'une page web via Puppeteer `page.pdf()`. Utile pour archiver.
  - **Effort** : 20min

- [ ] **Page diff / monitoring** — `web_diff` : Compare le contenu SHA-256 d'une page entre deux lectures. Retourne le diff unifié.
  - **Qui l'a** : changedetection.io (projet externe, pas MCP)
  - **Effort** : 1h

- [ ] **robots.txt + sitemap** — Respecter `robots.txt` avant de crawler. Parser `sitemap.xml` pour découvrir les pages d'un site.
  - **Qui l'a** : Crawl4AI ✅ (crawl_sitemap), Firecrawl ✅
  - **Effort** : 1h

---

## 🔵 Tier 3 — Horizon lointain (R&D)

### Scalabilité
- [ ] **Headless browser pool** — Maintenir un pool de 2-3 browser instances Puppeteer pour paralléliser les rendus SPA. Actuellement un seul singleton.
  - **Qui l'a** : mrkrsl ✅ (BrowserPool avec Chromium+Firefox+WebKit rotation), Playwright MCP ✅
  - **Effort** : 2h

- [ ] **Crawl4AI integration** — Remplacer Readability+Turndown par Crawl4AI (Python) pour une extraction LLM-aware. Nécessite un bridge Node→Python.
  - **Qui l'a** : Crawl4AI MCP ✅ (scrape, crawl, crawl_site, crawl_sitemap — 4 outils)
  - **Note** : Crawl4AI est Python-only, nécessite un subprocess ou un micro-service Docker

- [ ] **Local embedding search** — Indexer les pages lues dans un vector store local (SQLite-vec ou ChromaDB). Permet à l'agent de chercher dans son historique de lecture.
  - **Qui l'a** : Jina ✅ (embeddings + reranker cloud), Exa ✅ (neural search natif)
  - **Modèle** : `all-MiniLM-L6-v2` via ONNX (runs sur CPU)
  - **Effort** : 3h

### Robustesse
- [ ] **OCR fallback** — Tesseract.js pour les images/figures dans les pages web. Lourd mais parfois nécessaire pour les infographies et screenshots de code.
  - **Qui l'a** : Jina ✅ (`extract_pdf` pour figures/tables/equations dans les PDFs)
  - **npm** : `tesseract.js`
  - **Effort** : 2h

- [ ] **Proxy rotation** — Support SOCKS5/HTTP proxy pour éviter les rate limits et IP bans. Configuration via `PROXY_URL` env var.
  - **Effort** : 1h

- [ ] **Authentification** — Support pour les sites nécessitant login (GitHub auth pour 5000 req/h, Reddit OAuth pour les posts privés, etc.). Stockage sécurisé des tokens.
  - **Effort** : 3h

- [ ] **HTTP/2 + fallback HTTP/1.1** — mrkrsl implémente un fallback automatique HTTP/2 → HTTP/1.1 quand le serveur rejette la connexion. Certains sites bloquent HTTP/2.
  - **Qui l'a** : mrkrsl ✅
  - **Effort** : 30min

---

## 📊 Benchmark concurrentiel

### Classement par stars GitHub

| # | Projet | ⭐ | Lang | API key? | Local? | Search | Read | Crawl |
|---|---|---|---|---|---|---|---|---|
| 1 | **Playwright MCP** (Microsoft) | 32k | TS | Non | ✅ | ❌ | ❌ | ❌ (browser automation) |
| 2 | **Firecrawl MCP** | 6.3k | JS | **Oui** | ❌ (ou self-host) | ✅ | ✅ | ✅ |
| 3 | **Exa MCP** | 4.4k | TS | **Oui** | ❌ | ✅ (neural) | ✅ | ✅ |
| 4 | **Tavily MCP** | 1.9k | JS | **Oui** | ❌ | ✅ | ✅ | ✅ |
| 5 | **Brave Search MCP** | 1k | TS | **Oui** | ❌ | ✅ | ❌ | ❌ |
| 6 | **SearXNG MCP** (ihor-sokoliuk) | 764 | TS | Non | ✅ | ✅ | ❌ | ❌ |
| 7 | **web-search-mcp** (mrkrsl) | 851 | TS | Non | ✅ | ✅ | ✅ | ❌ |
| 8 | **Jina MCP** | 673 | TS | Partiel | ❌ | ✅ | ✅ | ❌ |
| 9 | **Search1API MCP** | 172 | TS | **Oui** | ❌ | ✅ | ✅ | ❌ |
| 10 | **Crawl4AI MCP** | 84 | Py | Non | ✅ | ❌ | ✅ | ✅ |
| 11 | **Fetch MCP** (official) | — | Py | Non | ✅ | ❌ | ✅ | ❌ |
| 12 | **Linkup MCP** | 28 | TS | **Oui** | ❌ | ✅ | ✅ | ❌ |
| — | **Hugin** (nous) | — | JS | **Non** | ✅ | ✅ | ✅ | ❌ bientôt |

### Matrice fonctionnelle

| Feature | **Hugin** | **Firecrawl** | **Exa** | **Tavily** | **Brave** | **SearXNG** | **mrkrsl** | **Jina** | **Crawl4AI** | **Playwright** | **Fetch** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Prix** | **$0** | Freemium | $1000 free then paid | 1k free/mo | $5 free/mo | **$0** | **$0** | Freemium | **$0** | **$0** | **$0** |
| **100% local** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Zero config** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Poids install** | **~2MB** | ~500MB | Remote | Remote | Remote | ~1MB | ~200MB | Remote | ~500MB | ~200MB | ~50MB |
| **Search** | 70+ engines | ✅ | ✅ neural | ✅ | ✅ Brave index | ✅ SearXNG | 3 engines | ✅ | ❌ | ❌ | ❌ |
| **Read markdown** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Batch reads** | ✅ `urls[]` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ auto | ✅ parallel | ❌ | ❌ | ❌ |
| **Cache** | ✅ SQLite | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Readers spécialisés** | **14** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **GitHub API** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **YouTube** | ✅ transcripts | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Wikipedia** | ✅ 30x clean | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **full-web-search** | ❌ bientôt | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Deep research** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Screenshots** | ❌ bientôt | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Extraction structurée** | ❌ bientôt | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Crawl sitemap** | ❌ bientôt | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Reranker** | ❌ bientôt | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Query expansion** | ❌ bientôt | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Dedup sémantique** | ❌ bientôt | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **ArXiv search** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **PDF extraction** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Anti-détection** | Basique | ✅ | N/A | N/A | N/A | N/A | ✅ | N/A | ✅ | ✅ | N/A |
| **Fingerprint random** | ❌ bientôt | ✅ | N/A | N/A | N/A | N/A | ✅ | N/A | N/A | ✅ | N/A |
| **Quality scoring** | ❌ bientôt | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Notre positionnement unique

```
             API key requise                                       100% local & gratuit
             ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

  Jina ○     Tavily ○     Brave ○     Exa ○     Firecrawl ○     Search1API ○
  (673⭐)    (1.9k⭐)    (1k⭐)      (4.4k⭐)   (6.3k⭐)        (172⭐)


  Fetch ●  SearXNG MCP ●  mrkrsl ●   Crawl4AI ●     Hugin ●
  (official) (764⭐)      (851⭐)    (84⭐)         (nous)
```

**Hugin est le seul qui combine :**
- Search + Read + Readers spécialisés dans un seul serveur
- 100% local, 100% gratuit, zéro API key
- Zero config (Chrome auto-detect, SearXNG auto-start)
- Cache SQLite (personne d'autre ne cache)
- 14 readers spécialisés (personne d'autre n'en a autant)
- ~2MB install (le plus léger de tous ceux qui font search+read)

**Ce qu'on doit rattraper pour être le meilleur :**
1. `full-web-search` (mrkrsl, Tavily, Firecrawl l'ont)
2. Screenshots (Jina, Playwright l'ont)
3. Extraction structurée JSON (Firecrawl, Crawl4AI l'ont)
4. Deep research / crawl (Firecrawl, Tavily, Crawl4AI l'ont)
5. Reranker (Jina, Exa l'ont)
6. Quality scoring (mrkrsl l'a)

---

## Références

| Ressource | URL | ⭐ | Note |
|---|---|---|---|
| Playwright MCP | github.com/microsoft/playwright-mcp | 32k | Browser automation, accessibility snapshots |
| Firecrawl MCP | github.com/firecrawl/firecrawl-mcp-server | 6.3k | Scrape + search + crawl + deep research |
| Exa MCP | github.com/exa-labs/exa-mcp-server | 4.4k | Neural search, code search, reranker |
| Tavily MCP | github.com/tavily-ai/tavily-mcp | 1.9k | Search + extract + map + crawl |
| Brave Search MCP | github.com/brave/brave-search-mcp-server | 1k | Web/image/video/news/local search |
| SearXNG MCP | github.com/ihor-sokoliuk/mcp-searxng | 764 | Search uniquement via SearXNG |
| web-search-mcp | github.com/mrkrsl/web-search-mcp | 851 | Multi-engine + full-web-search + quality scoring |
| Jina MCP | github.com/jina-ai/MCP | 673 | Read + search + screenshots + reranker + dedup |
| Search1API MCP | github.com/fatwang2/search1api-mcp | 172 | Search + crawl + news |
| Crawl4AI MCP | github.com/sadiuysal/crawl4ai-mcp-server | 84 | Scrape + crawl + crawl_site + crawl_sitemap |
| Fetch MCP (official) | github.com/modelcontextprotocol/servers/tree/main/src/fetch | — | Fetch URL → markdown, chunked reading |
| Linkup MCP | github.com/LinkupPlatform/linkup-mcp-server | 28 | Search + fetch avec deep mode |
| awesome-mcp-servers | github.com/punkpeye/awesome-mcp-servers | — | Liste de tous les MCP servers |
| Crawl4AI | github.com/unclecode/crawl4ai | 38k | Python, LLM-aware extraction |
| Firecrawl (OSS) | github.com/firecrawl/firecrawl | 70k | TypeScript, self-hostable |
| Semantic Scholar API | semanticscholar.org/product/api | — | 200M+ papers, REST gratuit |
| puppeteer-extra-stealth | npmjs.com/package/puppeteer-extra-plugin-stealth | — | Anti-détection Puppeteer |
| changedetection.io | github.com/dgtlmoon/changedetection.io | — | Page diff, self-hosted |
| Wayback Machine API | archive.org/wayback/available | — | Snapshots historiques |
| Apple Podcast transcripts | github.com/dado3212/apple-podcast-transcripts | — | Reverse engineering |

---

## Changelog

### v8.0.0 — 2026-05-09 — Rework complet
- 🏗️ Renamed: mcp-local-websearch → @ketlark/hugin-mcp
- 📦 Entry point: src/index.js, bin/hugin-mcp, npm publishable
- 🖥️ Multi-platform: Chrome auto-detect macOS/Linux/Windows/Brave/Edge
- 🧪 Smoke tests (npm test → 7/7)
- 📖 README complet: 6 clients, tools ref, config, troubleshooting
- 🔧 Config: HUGIN_* env vars + .env.example
- 📊 Benchmark: 12 concurrents analysés

### v7.0.0 — 2026-05-09 — Architecture refactor + Tier 1&2
- 🏗️ Monolith 1070 lignes → 21 modules SOLID
- 14 readers spécialisés (GitHub, Reddit, YouTube, HN, SE, Wikipedia, ArXiv, MDN, npm, Docker, PDF)
- Puppeteer warm pool, Wikipedia 30x plus petit
- Cache SQLite, batch reads, GFM, ReaderLM optionnel

### v6.1 — 2026-05-09
- Reddit JSON API, old.reddit, Puppeteer fallback, cache, batch
