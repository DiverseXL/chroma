# Chroma — multi-agent image generation with a live canvas.

An AI creative director turns a brief into an image set through a scheduled DAG of planner, style analyst, prompt compiler, image generator, vision critic, and composer.

Live demo · [chroma-pl1b.onrender.com](https://chroma-pl1b.onrender.com)<br>
Demo video · [vimeo.com/1219823839](https://vimeo.com/1219823839)<br>
Repo · [github.com/DiverseXL/chroma](https://github.com/DiverseXL/chroma)<br>
Built for Banana Hacks 2026

## What it does

Enter a brief such as “four panels of a courier crossing a flooded Kyoto at dawn” and start a run.
The React Flow canvas shows the planned DAG, node status, events, and image artifacts as they arrive.
The composer collects the generated panels; download them as a ZIP.

## Architecture

- `packages/core` — DAG compiler, topological scheduler, retries and backoff, event bus, node executors
- `packages/db` — Prisma schema and client for runs, nodes, edges, artifacts, and events
- `packages/providers` — Cloudflare Workers AI image adapter, Google Gemini text and vision adapter, KIE image fallback, capability-keyed composite adapter
- `apps/web` — Next.js 15 App Router, React Flow canvas, SSE event stream, run and ZIP-download routes

## Pipeline

1. **Planner** — brief → Story Bible (characters, locations, style, arc) → Scene Plan per panel
2. **Compiler** — validates inputs, references, reachability, terminals, and cycles; topologically sorts the graph
3. **Scheduler** — in-degree counters, ranked ready queue, four-worker pool, parallel fan-out
4. **Generation** — Cloudflare Workers AI FLUX.1 schnell; four panels by default
5. **Critique** — Gemini vision scores each panel against its Scene Plan and shared style
6. **Regeneration** — score below `0.7` inserts a generation node with critic issues; up to two regenerations per panel
7. **Compose** — collects image artifacts; download the panels as a ZIP

## Stack

Runtime · Node.js, TypeScript, pnpm 11.9.0<br>
Frontend · Next.js 15, React 19, React Flow 12<br>
Backend · Next.js Route Handlers, `@chroma/core`<br>
Database · Neon Postgres, Prisma<br>
Providers · Cloudflare Workers AI, Google Gemini, KIE AI<br>
Hosting · Render (web), Cloudflare Workers (image endpoint)

## Running locally

```sh
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Environment (`.env.example`; 13 keys)

```text
DATABASE_URL · database
DIRECT_URL · direct
POSTGRES_URL · database
GEMINI_API_KEY · Gemini
GOOGLE_MODEL_NANO_BANANA · image
GOOGLE_MODEL_VISION · vision
GOOGLE_MODEL_TEXT · text
CF_WORKER_URL · endpoint
CF_API_KEY · worker
KIE_API_KEY · fallback
KIE_BASE_URL · endpoint
KIE_MODEL · model
POLLINATIONS_API_KEY · probe
```

## Design decisions

- Prefix node IDs with the run ID; Prisma stores them as globally unique primary keys.
- Increment `Run.eventSequence` with atomic `UPDATE ... RETURNING`; concurrent fan-out gets unique event numbers without an application lock.
- Assign adapters by capability; image, vision, and text providers can change independently.
- Fall back to a deterministic planner on Gemini `429`/`503` and a `0.75` heuristic score when vision is unavailable.

## Provider notes

Cloudflare Workers AI generates images; a `ProviderError` invokes KIE AI as the image fallback. Gemini handles planning, style, prompts, and vision critique. Planner rate limits use deterministic plans; unavailable vision uses the heuristic scorer. Image nodes retry up to three times with exponential backoff; KIE errors have no further provider fallback. Pollinations is probe-only. Verified API shapes and provider findings: [`docs/provider-facts.md`](docs/provider-facts.md).

## License

MIT
