# QoL Project Hardening — Start Prompt

## Goal

Installer 8 améliorations QoL sur `@ketlark/hugin-mcp` : unit tests, CI, release workflow (changelog auto), pre-commit hooks (lint + tests), commitlint, CHANGELOG.md, CONTRIBUTING.md, README badges. Chaque step = un commit conventional séparé.

## Context

**Projet** : `@ketlark/hugin-mcp` — MCP server 100% local pour web search + reading.
**Repo** : `git@github.com:Ketlark/hugin-mcp.git` (branche `main`, remote `origin`)
**Runtime** : Node 22, npm 10, ESM (`"type": "module"`)
**Linting** : Biome v2.4.16 (`biome.json` — 2 espaces, double quotes, lineWidth 120)
**Tests actuels** : `test/smoke.mjs` (14/14 passent, MCP server + HTTP calls réels)
**CI** : Aucun. **Hooks** : Aucun.

**Modules testables sans mocking** (fonctions pures) :
- `src/format.js` — `formatSearchResponse`, `formatReadResponse`
- `src/html.js` — `htmlToMarkdown`, `stripTags`, `cleanHTML`, `extractLinks`, `extractImages`

**Modules avec side effects à l'import** (ne pas tester en unit) :
- `src/cache.js` — crée DB SQLite à l'import
- `src/config.js` — `Object.freeze` + `existsSync` + `process.env`
- `src/search/searxng.js` — HTTP via `robustFetch`

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

## Plan (8 steps, un commit conventional par step)

### Step 1 — `test: add unit tests for format and html modules`

Créer `test/unit/format.test.mjs` et `test/unit/html.test.mjs` avec `node:test` + `node:assert/strict`.

- format : `formatSearchResponse` (results + engine, empty), `formatReadResponse` (page, missing title)
- html : `stripTags`, `cleanHTML` (script/style removal), `htmlToMarkdown` (headings, empty), `extractLinks` (extract + none), `extractImages`

Ajouter scripts dans `package.json` : `"test:unit": "node --test test/unit/*.test.mjs"`, `"test:all": "npm run test:unit && npm test"`.

Valider : `npm run test:unit` passe.

### Step 2 — `ci: add GitHub Actions workflow`

Créer `.github/workflows/ci.yml` :
- Deux jobs : `lint` (Node 22, `npm run lint`) et `test` (Node 22, service container SearXNG, health check retry 15×1s, `npm run test:all` avec `continue-on-error: true`).
- Service container SearXNG : `searxng/searxng:latest`, port 8888:8080.
- Health check : boucle bash `curl -sf http://localhost:8888/healthz` 15 fois avec 1s sleep.
- Node 22 uniquement (pas de matrice).

### Step 3 — `ci: add release workflow with auto-changelog`

Créer `.github/workflows/release.yml` :
- Trigger : `push tags: ["v*"]`
- `fetch-depth: 0` (historique complet)
- Script bash : récupérer le tag précédent via `git describe`, parser les conventional commits (`feat` → Added, `fix` → Fixed, reste → Changed), prepend au CHANGELOG.md
- `npm publish --access public` avec `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
- Pas de `npm test` (CI déjà verte), pas de `permissions: contents: write`

### Step 4 — `chore: add husky and lint-staged pre-commit hooks`

```bash
npm install --save-dev husky lint-staged
npx husky init
```

Écraser `.husky/pre-commit` avec :
```bash
npx lint-staged
npm run test:unit
```

Ajouter dans `package.json` :
```json
"lint-staged": {
  "*.{js,mjs}": ["biome check --fix --no-errors-on-unmatched-files"],
  "*.{json,md,yml}": ["biome format --write --no-errors-on-unmatched-files"]
}
```

Flag Biome = `--no-errors-on-unmatched-files` (pas `--no-errors-on-unmatched`).

### Step 5 — `chore: add commitlint for conventional commits`

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

Créer `commitlint.config.js` : `export default { extends: ["@commitlint/config-conventional"] };`

Créer `.husky/commit-msg` : `npx --no -- commitlint --edit $1`

### Step 6 — `docs: add CHANGELOG.md`

Créer `CHANGELOG.md` au format Keep a Changelog avec entrées v1.0.0 et v1.1.0.
Ajouter `"CHANGELOG.md"` dans `package.json` → `files`.
Ajouter en haut du TRACKER.md : `> Voir [CHANGELOG.md](CHANGELOG.md) pour l'historique des releases publiques.`
Ne pas retirer le changelog existant du TRACKER.

### Step 7 — `docs: add CONTRIBUTING.md`

Créer `CONTRIBUTING.md` : Setup, Development commands, Conventions (ESM, Biome, conventional commits, commitlint), PR Checklist.

### Step 8 — `docs: add CI badge to README`

Remplacer le bloc badges `<p align="center">` dans README.md avec 4 badges : npm version, CI status, Node version, License. Pas de badge downloads.

## Acceptance criteria

- `npm run lint` passe
- `npm run test:unit` passe
- `npm test` passe (14/14 smoke)
- `npm run test:all` passe
- `git commit` déclenche lint-staged + unit tests
- `git commit -m "bad"` rejeté par commitlint
- `.github/workflows/ci.yml` existe (lint + test, health check, continue-on-error)
- `.github/workflows/release.yml` existe (changelog auto + publish)
- `CHANGELOG.md` + `CONTRIBUTING.md` existent
- README a 4 badges

## Risks

- **NPM_TOKEN** : secret manuel requis (GitHub Settings → Secrets → Actions). Sans lui, release workflow échoue.
- **CI flakes** : `continue-on-error` sur les tests réseau → CI parfois jaune.
- **Changelog auto** : dépend de la qualité des messages de commit. commitlint réduit le risque.
- **Husky prepare** : lancer `npm install` avant `npx husky init`.
