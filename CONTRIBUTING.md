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