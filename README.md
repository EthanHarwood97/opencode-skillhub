# SkillHub

A local catalog and dashboard for agent skills. Pull skills from GitHub and marketplaces, score them, install the ones you pick as pinned copies, and keep your agent's context small: opencode advertises only the skills you activate.

The name is provisional. The tool is personal-first and works offline after a sync.

## What it does

- **Find.** Search a local catalog of scored skills from the dashboard, the CLI, or the agent's router tool.
- **Trust.** Every install is pinned to a commit or content hash and verified before it lands. A static scan flags risky patterns, and nothing installs or activates without an explicit command.
- **Stay small.** Activated skills live in a managed folder that opencode advertises. The rest stay in the catalog.
- **Learn.** Skills you load often become promotion candidates; the dashboard shows the queue.
- **Trend.** Daily star snapshots produce 7-day and 30-day velocity, plus new-this-month finds.

## Quickstart

```bash
git clone <repository-url> SkillHub
cd SkillHub
npm install
npm run catalog:sync -- --topics claude-skills --max-repos 5 --max-skills 5
npm run skillhub -- catalog import catalog
npm run ui:build
npm run skillhub -- ui
```

The dashboard opens at http://127.0.0.1:4517.

## Commands

Run them as `npm run skillhub -- <command>` from a checkout.

| Command | What it does |
|---|---|
| `npm run catalog:sync -- [flags]` | Ingest live sources into `catalog/`. Flags: `--topics`, `--max-repos`, `--max-skills`, `--agentskills <url>`, `--agentskills-limit`, `--out`, `--state`. The LLM rubric is opt-in: `--llm --max-usd <usd>`. |
| `search <query>` | Search the imported catalog. |
| `info <id>` / `why <id>` | The full record, or the score breakdown with reasons. |
| `list [--category]` | Browse the catalog. |
| `install <id> [--dry-run] [--activate]` | Fetch, verify, and copy the pinned files. |
| `review <id>` | Show the diff, risk delta, and score delta for an update. |
| `update [id] --apply` | Apply a reviewed update. |
| `activate <id>` / `deactivate <id>` | Move a skill in or out of the advertised set. |
| `calibrate --golden <file> [--apply]` | Tune ranking weights against your labels. |
| `label export` / `label import` | Produce and import a labeling worksheet. |
| `trending` | Velocity leaders from the last sync. |
| `ui [--port <n>] [--export <dir>]` | Open the dashboard, or write a read-only static gallery. |

## The dashboard

Six views: Status, Gallery, Clusters, Trending, Review, and skill detail. Detail shows why a skill scored what it scored, the scan findings, requirements, files, and source. Install runs a dry-run verification first, and you see the result before anything is written.

`skillhub ui --export <dir>` writes the same UI as a static site with `data/*.json` files. No server, no actions. Serve the folder anywhere, or use the bundled `pages` workflow after enabling GitHub Pages in the repository settings.

## Automatic retrieval

Every prompt is matched against the catalog before the model answers. The plugin embeds your message (noise-free: one embedding call per prompt, cached in memory), blends that with the local full-text search, and appends the best matches to the context as a small block — name, id, score, risk, one line each. The model can load any of them with `skillhub_load`.

- Default mode is `suggest`: up to three pointers (configurable), never a body.
- `auto` (opt-in) additionally inlines one matching skill body above a high confidence bar, and counts as a load in the usage ledger.
- Retrieval always fails open: if embeddings are unavailable it falls back to keyword matching, and if everything fails the turn proceeds without the block.
- When retrieval is on, **your prompt text is sent to Google's embeddings endpoint** (Gemini). Prefer not? Set `retrieval.embed` to `off` in `<skillhub home>/settings.json` for keyword-only matching, or `retrieval.mode` to `off` for no retrieval. Cost is pennies: roughly $0.15 per million tokens, about 9 cents a month at 100 prompts a day.

## Calibration

Ranking starts with fixed weights. To tune it against your judgment:

1. `npm run skillhub -- label export --limit 40` writes a worksheet.
2. Fill the tier column (1 = best, 4 = weak), then `npm run skillhub -- label import worksheet.tsv --out golden.json`.
3. `npm run skillhub -- calibrate --golden golden.json --apply` writes `catalog/calibration.json`. The next sync uses those weights.

## Security model

- Installs are pinned (`sha-pinned` for GitHub, `content-hash-pinned` for marketplace zips) and hash-verified before writing.
- A deterministic scan flags injection, exfiltration, shell, and obfuscation patterns. Critical findings quarantine the skill instead of hiding it.
- The dashboard binds to 127.0.0.1. Its mutating endpoints require a per-run token, and the static export has no actions at all.
- The LLM rubric treats skill text as untrusted data, and it never runs unless you pass `--llm` with a dollar cap.

## Development

```bash
npm test          # unit and integration tests; no network
npm run typecheck
npm run ui:build
npm run test:e2e  # Playwright against a generated fixture store
```

Design and phase plans live in `docs/superpowers/`.

## Limits

- The static gallery filters in the browser and caps at `--max-records` (5,000 by default). Tens of thousands of skills need a hosted search service; that is not built.
- Calibration needs your labels. The default weights are a starting point, not a verdict.
- Windows and Linux run in CI. macOS is untested.
