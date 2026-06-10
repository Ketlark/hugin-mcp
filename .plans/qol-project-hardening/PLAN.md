# QoL Project Hardening — 8 improvements

Mettre en place CI, release automation (avec changelog auto), pre-commit hooks (lint + unit tests), commitlint, CHANGELOG, CONTRIBUTING, unit tests, et badges.

## Context

**Projet** : `@ketlark/hugin-mcp` — MCP server 100% local pour web search + reading.
**Repo** : `git@github.com:Ketlark/hugin-mcp.git` (branche `main`, remote `origin`)
**Runtime** : Node 22.22.3, npm 10.9.8, ESM (`"type": "module"`)
**Linting** : Biome v2.4.16 (`biome.json`) — 2 espaces, double quotes, lineWidth 120
**Tests** : `test/smoke.mjs` (14/14 passent, spawn un vrai MCP server, HTTP calls réels)
**CI** : Aucun workflow. **Hooks** : Aucun.

**Fichiers clés** :
- `package.json` — `files: ["src", ...]`, `bin.hugin-mcp` + `bin.hugin-mcp-setup`
- `src/format.js` — fonctions pures : `formatSearchResponse`, `formatReadResponse`
- `src/html.js` — fonctions pures : `htmlToMarkdown`, `stripTags`, `cleanHTML`, `extractLinks`, `extractImages`
- `src/cache.js` — crée DB SQLite **à l'import** (side effect)
- `src/config.js` — `Object.freeze` au scope module, appelle `existsSync`
- `src/search/searxng.js` — fait du HTTP via `robustFetch`

**Package actuel** :
```json
{
  "version": "1.1.0", "type": "module", "main": "src/index.js",
  "files": ["src", "docker-compose.yml", "searxng-settings.yml", "LICENSE", "README.md"],
  "scripts": {
    "start": "node src/index.js", "test": "node test/smoke.mjs",
    "lint": "biome check src/ test/",
    "lint:fix": "biome check --fix --unsafe src/ test/",
    "format": "biome format --write src/ test/"
  },
  "engines": { "node": ">=18.0.0" },
  "devDependencies": { "@biomejs/biome": "^2.4.16" }
}
```

## Decisions log (from grilling)

| Décision | Choix | Raison |
|---|---|---|
| NPM_TOKEN | Inclure release workflow, token créé manuellement après | Pas de bloqueur |
| Matrice CI | Node 22 uniquement | Moins de flakes, `engines` couvre le reste |
| Smoke tests CI | `continue-on-error: true` | Rate limits Bing = false negatives |
| Pre-commit hook | lint-staged + unit tests | Rapide, offline, rattrape les regressions |
| Changelog | Automatisé depuis conventional commits | Moins de travail manuel |
| Commit format | Conventional commits | Requis pour le changelog auto |
| Enforcement | commitlint + commit-msg hook | Garantit le format |
| SearXNG CI | Health check explicite (retry loop) | Service container peut être lent à démarrer |
| Items supprimés | `.nvmrc`, `.editorconfig`, `exports` | YAGNI — ajoutables en 5 min si demandé |
| Stratégie de commit | Commits séparés par step | Cohérent avec conventional commits |

---

## Plan (8 steps, ordre d'exécution)

### Step 1 — Unit tests

**Commit** : `test: add unit tests for format and html modules`

**Créer** `test/unit/format.test.mjs` :

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSearchResponse, formatReadResponse } from "../../src/format.js";

describe("formatSearchResponse", () => {
  it("formats results with engine name", () => {
    const text = formatSearchResponse(
      { query: "test", results: [{ title: "T", url: "http://a.com", snippet: "S", domain: "a.com" }], page: 1 },
      "searxng",
    );
    assert.match(text, /test/);
    assert.match(text, /http:\/\/a\.com/);
    assert.match(text, /searxng/);
  });

  it("handles empty results", () => {
    const text = formatSearchResponse({ query: "empty", results: [], page: 1 }, "bing");
    assert.match(text, /0 results/);
  });
});

describe("formatReadResponse", () => {
  it("formats a page with title, url, content", () => {
    const text = formatReadResponse({ title: "Hello", url: "http://b.com", content: "Body text", source: "test" });
    assert.match(text, /# Hello/);
    assert.match(text, /http:\/\/b\.com/);
    assert.match(text, /Body text/);
  });

  it("handles missing title", () => {
    const text = formatReadResponse({ title: "", url: "http://c.com", content: "X", source: "test" });
    assert.match(text, /Untitled/);
  });
});
```

**Créer** `test/unit/html.test.mjs` :

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, stripTags, cleanHTML, extractLinks, extractImages } from "../../src/html.js";

describe("stripTags", () => {
  it("removes all HTML tags", () => {
    assert.strictEqual(stripTags("<h1>Hello</h1> <b>world</b>"), "Hello world");
  });
  it("returns plain text unchanged", () => {
    assert.strictEqual(stripTags("no tags here"), "no tags here");
  });
});

describe("cleanHTML", () => {
  it("removes script and style blocks", () => {
    const html = '<script>alert("xss")</script><p>keep</p><style>.x{}</style>';
    assert.ok(!cleanHTML(html).includes("script"));
    assert.ok(!cleanHTML(html).includes("style"));
    assert.ok(cleanHTML(html).includes("keep"));
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings and paragraphs", () => {
    const md = htmlToMarkdown("<h1>Title</h1><p>Paragraph</p>");
    assert.match(md, /Title/);
    assert.match(md, /Paragraph/);
  });
  it("handles empty input", () => {
    assert.strictEqual(htmlToMarkdown(""), "");
  });
});

describe("extractLinks", () => {
  it("extracts markdown links", () => {
    const links = extractLinks("[Google](https://google.com) [GitHub](https://github.com)");
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].text, "Google");
    assert.strictEqual(links[0].href, "https://google.com");
  });
  it("returns undefined for no links", () => {
    assert.strictEqual(extractLinks("no links here"), undefined);
  });
});

describe("extractImages", () => {
  it("extracts markdown images", () => {
    const images = extractImages("![alt text](http://img.png)");
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0].alt, "alt text");
  });
});
```

**Ajouter** dans `package.json` → `scripts` :
```json
"test:unit": "node --test test/unit/*.test.mjs",
"test:all": "npm run test:unit && npm test"
```

**Valider** : `npm run test:unit` passe.

---

### Step 2 — CI GitHub Actions

**Commit** : `ci: add GitHub Actions workflow`

**Créer** `.github/workflows/ci.yml` :

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      searxng:
        image: searxng/searxng:latest
        ports:
          - 8888:8080
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Wait for SearXNG
        run: |
          for i in $(seq 1 15); do
            if curl -sf http://localhost:8888/healthz > /dev/null 2>&1; then
              echo "SearXNG ready"
              exit 0
            fi
            echo "Waiting for SearXNG... ($i/15)"
            sleep 1
          done
          echo "SearXNG not ready after 15s, tests will use Bing fallback"
      - run: npm run test:all
        continue-on-error: true
```

**Décisions** :
- Node 22 uniquement (pas de matrice)
- Service container SearXNG natif GitHub Actions
- Health check explicite avec retry (15 tentatives, 1s interval)
- `continue-on-error: true` sur les tests (smoke tests font des HTTP calls réels, peuvent flaker)
- `npm run test:all` pour lancer unit + smoke

---

### Step 3 — Release workflow + changelog auto

**Commit** : `ci: add release workflow with auto-changelog`

**Créer** `.github/workflows/release.yml` :

```yaml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - name: Update CHANGELOG
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          VERSION=${GITHUB_REF_NAME}
          DATE=$(date +%Y-%m-%d)

          echo "## [${VERSION#v}] - ${DATE}" > /tmp/changelog-entry.md

          if [ -n "$PREV_TAG" ]; then
            LOG_RANGE="$PREV_TAG..HEAD"
          else
            LOG_RANGE="HEAD"
          fi

          # Parse conventional commits
          FEATS=$(git log $LOG_RANGE --format="- %s" --grep="^feat" 2>/dev/null || true)
          FIXES=$(git log $LOG_RANGE --format="- %s" --grep="^fix" 2>/dev/null || true)
          CHORES=$(git log $LOG_RANGE --format="- %s" --grep="^chore\|^ci\|^docs\|^style\|^refactor\|^perf\|^test" 2>/dev/null || true)
          OTHER=$(git log $LOG_RANGE --format="- %s" --invert-grep --grep="^feat\|^fix\|^chore\|^ci\|^docs\|^style\|^refactor\|^perf\|^test" 2>/dev/null || true)

          if [ -n "$FEATS" ]; then echo -e "\n### Added\n$FEATS" >> /tmp/changelog-entry.md; fi
          if [ -n "$FIXES" ]; then echo -e "\n### Fixed\n$FIXES" >> /tmp/changelog-entry.md; fi
          if [ -n "$OTHER" ]; then echo -e "\n### Changed\n$OTHER" >> /tmp/changelog-entry.md; fi
          if [ -n "$CHORES" ]; then echo -e "\n### Internal\n$CHORES" >> /tmp/changelog-entry.md; fi

          # Prepend to CHANGELOG.md
          if [ -f CHANGELOG.md ]; then
            echo -e "$(cat /tmp/changelog-entry.md)\n\n$(cat CHANGELOG.md)" > CHANGELOG.md
          else
            cp /tmp/changelog-entry.md CHANGELOG.md
          fi

          cat CHANGELOG.md
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Notes** :
- `fetch-depth: 0` pour avoir tout l'historique et pouvoir comparer les tags
- Parse les conventional commits depuis le dernier tag → sections Added / Fixed / Changed / Internal
- Prepend au CHANGELOG.md existant
- Pas de `npm test` (CI déjà verte sur le commit tagué)
- Pas de `permissions: contents: write` (pas de git push)
- **Prérequis manuel** : créer `NPM_TOKEN` dans GitHub Settings → Secrets → Actions

---

### Step 4 — Pre-commit hooks (lint-staged + unit tests)

**Commit** : `chore: add husky and lint-staged pre-commit hooks`

**Installer** :
```bash
npm install --save-dev husky lint-staged
npx husky init
```

`husky init` crée `.husky/pre-commit` (avec `npm test` par défaut) et ajoute `"prepare": "husky"` dans `package.json`.

**Écraser** `.husky/pre-commit` avec :
```bash
npx lint-staged
npm run test:unit
```

**Ajouter** dans `package.json` :
```json
"lint-staged": {
  "*.{js,mjs}": ["biome check --fix --no-errors-on-unmatched-files"],
  "*.{json,md,yml}": ["biome format --write --no-errors-on-unmatched-files"]
}
```

**Attention** : flag Biome = `--no-errors-on-unmatched-files` (pas `--no-errors-on-unmatched`).

**Valider** : `git commit --allow-empty -m "test: hooks"` déclenche lint-staged + unit tests.

---

### Step 5 — Commitlint

**Commit** : `chore: add commitlint for conventional commits`

**Installer** :
```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

**Créer** `commitlint.config.js` :
```js
export default { extends: ["@commitlint/config-conventional"] };
```

**Créer** `.husky/commit-msg` :
```bash
npx --no -- commitlint --edit $1
```

**Valider** : `git commit -m "bad message"` → rejeté. `git commit -m "chore: test"` → accepté.

---

### Step 6 — CHANGELOG.md (initial)

**Commit** : `docs: add CHANGELOG.md`

**Créer** `CHANGELOG.md` :
```markdown
# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-06-10

### Added
- feat: `web_search_read` tool — search + auto-read top N pages in one call
- feat: `web_screenshot` tool — capture page screenshots as PNG/JPEG via Puppeteer
- feat: `domains[]` parameter on `web_search` — restrict search to specific domains
- feat: `filetype` parameter on `web_search` — restrict search to file type

## [1.0.0] - 2026-05-09

### Added
- feat: `web_search` tool — SearXNG (70+ engines) + Bing fallback
- feat: `web_read` tool — 14 specialized readers + Readability + Puppeteer fallback
- feat: SQLite cache (24h TTL), Puppeteer warm pool, cookie banner dismiss
- feat: ReaderLM-v2 optional integration
- feat: `npx @ketlark/hugin-mcp setup` command
- feat: Docker auto-start for SearXNG, Chrome auto-detect
```

**Ajouter** `"CHANGELOG.md"` dans `package.json` → `files` array.

**Ajouter** en haut du `TRACKER.md` :
```markdown
> Voir [CHANGELOG.md](CHANGELOG.md) pour l'historique des releases publiques.
```

Ne pas retirer le changelog existant du TRACKER (contient v7.0 et v6.1).

---

### Step 7 — CONTRIBUTING.md

**Commit** : `docs: add CONTRIBUTING.md`

**Créer** `CONTRIBUTING.md` :
```markdown
# Contributing

## Setup

```bash
git clone git@github.com:Ketlark/hugin-mcp.git
cd hugin-mcp
npm install
docker compose up -d   # optional, for SearXNG search
```

## Development

```bash
npm run lint            # check code quality
npm run lint:fix        # auto-fix
npm run test:unit       # unit tests (offline, fast)
npm test                # smoke tests (requires network)
npm run test:all        # unit + smoke
npm start               # start MCP server
```

## Conventions

- ESM (`"type": "module"`), Node `>=18`
- Biome for lint + format (`biome check src/ test/`)
- Pre-commit hooks: lint-staged (Biome) + unit tests
- Commit messages: conventional commits (feat:/fix:/chore:/docs:/ci:)
- commitlint enforces the format

## PR Checklist

1. `npm run lint` and `npm run test:all` pass
2. New tools have smoke test coverage
3. Commits follow conventional format
```

---

### Step 8 — README badges

**Commit** : `docs: add CI and badges to README`

**Modifier** `README.md` — remplacer le bloc `<p align="center">` des badges par :

```markdown
<p align="center">
  <a href="https://www.npmjs.com/package/@ketlark/hugin-mcp"><img src="https://img.shields.io/npm/v/@ketlark/hugin-mcp?color=blue" alt="npm"></a>
  <img src="https://img.shields.io/github/actions/workflow/status/Ketlark/hugin-mcp/ci.yml?branch=main&label=CI" alt="CI">
  <img src="https://img.shields.io/node/v/@ketlark/hugin-mcp" alt="node">
  <img src="https://img.shields.io/github/license/Ketlark/hugin-mcp" alt="license">
</p>
```

4 badges : npm version, CI status, Node version, License.

---

## Acceptance criteria

- [ ] `npm run lint` passe (0 erreurs Biome)
- [ ] `npm run test:unit` passe (~10 assertions)
- [ ] `npm test` passe (14/14 smoke tests)
- [ ] `npm run test:all` passe (unit + smoke)
- [ ] `git commit` déclenche lint-staged + unit tests
- [ ] `git commit -m "bad"` est rejeté par commitlint
- [ ] `.github/workflows/ci.yml` existe (lint + test jobs, health check SearXNG, continue-on-error)
- [ ] `.github/workflows/release.yml` existe (changelog auto + npm publish)
- [ ] `CHANGELOG.md` existe avec v1.0.0 et v1.1.0
- [ ] `CONTRIBUTING.md` existe
- [ ] README a 4 badges (npm, CI, node, license)

## Risks / Open questions

- **NPM_TOKEN** : doit être créé manuellement par le mainteneur. Le release workflow échouera silencieusement sans ce secret.
- **CI flakes** : les smoke tests font des HTTP calls réels. `continue-on-error: true` les rend non-bloquants mais la CI sera parfois jaune au lieu de verte.
- **Changelog auto** : le script parse les conventional commits. Si un commit n'a pas le bon format, il apparaîtra dans "Changed" au lieu de la bonne section. commitlint réduit ce risque.
- **Husky `prepare`** : s'exécute sur `npm install`. L'executor doit lancer `npm install` avant `npx husky init`.

## Éliminé du scope (justification)

| Item | Pourquoi |
|---|---|
| `.nvmrc` | `engines` existe déjà. Pertinent pour une app, pas un package. |
| `.editorconfig` | Biome gère déjà JS/JSON. Double autorité = conflits. |
| `exports` map | Serveur stdio, pas une lib. YAGNI. |
| Unit tests cache/config/searxng | Side effects à l'import. 2 fichiers pures > 5 fichiers mockés. |
