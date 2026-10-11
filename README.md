# Chroma

Provider verification + safe scaffold for **Banana Hacks 2026**.

This is step 0: confirm what the free providers actually offer, and stand up a
minimal TypeScript / pnpm workspace around it. **No UI, no React Flow, no DAG
engine yet.**

## Layout

```
chroma/
├── apps/web/            Next.js 15 (App Router) + TypeScript + Tailwind
├── packages/core/       Run / Node / NodeStatus / Artifact + ProviderAdapter
├── docs/
│   └── provider-facts.md  every provider fact, with a source URL
│   └── probe/             raw probe output (created when probes run)
├── scripts/
│   ├── probe-google.mjs       1 image call + 1 vision call
│   └── probe-pollinations.mjs 1 image call
├── pnpm-workspace.yaml
├── .env.example
└── eslint.config.mjs
```

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm build
```

## Artifact storage

Generated images and other artifacts are persisted in Postgres as `bytea`
(the `Artifact.data` column) — see
`packages/core/src/storage/postgres.ts`. Storing bytes in the database means
artifacts survive across invocations and work on serverless hosts such as
Vercel, where the filesystem is ephemeral and writes disappear as soon as the
function returns. The old local-disk layout under `.chroma/artifacts/` was
dev-only and is no longer read by the app.

`/api/artifacts/:id` streams the stored bytes back with the artifact's
original `Content-Type`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start `apps/web` |
| `pnpm build` | Build every workspace package |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | `tsc` in every workspace package |
| `pnpm probe` | Run both provider probes (writes to `docs/probe/`) |
| `pnpm db:keepalive` | Ping the DB every 4 min to prevent cold starts |

To keep the database warm automatically, add a `DATABASE_URL` repository
secret in GitHub Actions. The `Keep database awake` workflow pings every five
minutes and can also be started manually. Scheduled GitHub Actions may be
delayed, so this does not guarantee the database is always awake. For a local
session, run `pnpm db:keepalive` in a background terminal and stop it with
Ctrl+C when you are done.

## Provider facts

Everything known about the providers lives in
[`docs/provider-facts.md`](docs/provider-facts.md). Each fact carries a source
URL; anything not confirmable from live documentation is listed under
**UNCONFIRMED** instead of being guessed.

Two things worth knowing before you read it:

1. **Google's Nano Banana image models show `Not available` in the Free Tier
   column** of the pricing page — only the text/vision models are billed-free.
2. **Pollinations has two documented surfaces.** The current one
   (`gen.pollinations.ai`) requires an API key; the older keyless
   `image.pollinations.ai` form survives only on a stale git branch.

## Probes

Neither probe has been run yet. Set up `.env` first:

```powershell
Copy-Item .env.example .env
# edit .env and set GEMINI_API_KEY
```

Then, from the repository root:

```powershell
node scripts/probe-google.mjs
node scripts/probe-pollinations.mjs
```

Or both at once:

```powershell
pnpm probe
```

Status lines only — no keys are ever printed, and no key is hardcoded anywhere;
`.env` is gitignored.

## Rules for this repo

- No endpoint ID, model ID, request field or response shape is written down
  unless it came from live documentation or a real probe response.
- No hardcoded API keys. `.env.example` only.
- No paid providers. fal.ai is out of scope for this step.
