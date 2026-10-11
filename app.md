markdown

\# Chroma — App Page Specification



\## 1. Project Context



The landing page at `/` is complete. This document specifies the interactive

application at `/run` — the live canvas where judges see Chroma actually work.



The user types a brief. The engine (already built) plans a DAG, runs it with

parallel scheduling, generates images via Cloudflare Workers AI, scores them

with Gemini vision, and streams every state change over SSE. This page is the

window into that process.



The visual and motion language must match the landing page exactly. All tokens

and animation rules from `frontend.md` are authoritative here too.



\## 2. Layout



Three regions, side by side, full viewport height, no scroll on the outer frame:



\- Left sidebar: 300px fixed

\- Center canvas: flex-grow, the React Flow graph

\- Right inspector: 380px, slides in from the right when a node is selected,

&#x20; 0px when nothing is selected



Below 1024px viewport width: sidebar collapses to a top bar. Inspector becomes

a bottom sheet.



Header is NOT included on this page. The canvas fills the viewport.



\## 3. Left Sidebar



\### 3.1 Brief Input



Top of sidebar, padding 16px.



\- Small label: "BRIEF" in JetBrains Mono 500, 11px, letter-spacing 0.1em, --text-tertiary.

\- Textarea: 6 rows, dark background --bg-elevated, border 1px --border, border-radius 8px,

&#x20; padding 12px, font Inter 400 14px, color --text-primary, placeholder --text-tertiary.

&#x20; Placeholder text: "A 4-panel cinematic storyboard of a lone astronaut in a glowing bioluminescent forest at dusk."

&#x20; On focus: border-color --border-hover, no other change.

\- "Run" button below, full width, spec:

&#x20; ```css

&#x20; .run-button {

&#x20;   width: 100%;

&#x20;   padding: 10px 16px;

&#x20;   border-radius: 8px;

&#x20;   background: var(--text-primary);

&#x20;   color: var(--bg);

&#x20;   font: 500 14px var(--font-body);

&#x20;   border: none;

&#x20;   cursor: pointer;

&#x20;   transition: transform 120ms var(--ease-out), opacity 160ms var(--ease-out);

&#x20; }

&#x20; .run-button:hover { opacity: 0.9; }

&#x20; .run-button:active { transform: scale(0.97); }

&#x20; .run-button:disabled {

&#x20;   opacity: 0.4;

&#x20;   cursor: not-allowed;

&#x20;   transform: none;

&#x20; }

Disabled while a run is in progress.



Connection indicator: a 6px dot right-aligned next to the Run button, below it.

Green when SSE connected. Amber pulsing when reconnecting. Red when closed.

Label next to dot in JetBrains Mono 11px: "connected" / "reconnecting" / "closed".



3.2 Recent Runs

Below the brief, separated by a 1px --border line and 16px padding.



Small label: "RECENT" in the same style as "BRIEF".



List of up to 20 runs, newest first. Fetched from GET /api/runs.



Each item: a button, full width, padding 10px 12px, border-radius 8px,

transparent bg by default.

On hover (gated): bg --bg-elevated.

On active: bg --bg-elevated AND transform scale(0.99), 120ms --ease-out.



Item content:



Line 1: brief truncated to 60 chars, Inter 500 13px, --text-primary,

whitespace-nowrap, overflow-hidden, text-overflow ellipsis.



Line 2: status badge + relative time, JetBrains Mono 11px, --text-tertiary.

Status badge colors: SUCCEEDED green, FAILED red, RUNNING amber, DEGRADED purple,

PENDING gray.



Selected item (the currently loaded run): 2px left border in --accent,

background --bg-elevated.



Clicking an item loads that run: fetch snapshot, replace graph, open SSE.



4\. Center Canvas

4.1 React Flow Setup

Install: @xyflow/react dagre @types/dagre



Use React Flow v12 (@xyflow/react).



Nodes are controlled: nodes and edges are React state.



fitView on initial load and after any graph mutation that adds nodes.



Background: <Background variant="dots" gap={24} size={1} color="rgba(255,255,255,0.05)" />.



Controls: <Controls /> bottom-left, styled dark.



MiniMap: bottom-right, 160x100, styled dark, node colors match status.



No attribution badge (set proOptions={{ hideAttribution: true }} — note in the code

that this is a hackathon build; in production you'd keep it or pay for a license).



4.2 Layout with dagre

After every graph mutation (new node, new edge), recompute layout:



ts

import dagre from 'dagre';



const NODE\_WIDTH = 220;

const NODE\_HEIGHT = 96;



function layoutGraph(nodes: Node\[], edges: Edge\[]): Node\[] {

&#x20; const g = new dagre.graphlib.Graph();

&#x20; g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });

&#x20; g.setDefaultEdgeLabel(() => ({}));

&#x20; nodes.forEach((n) => g.setNode(n.id, { width: NODE\_WIDTH, height: NODE\_HEIGHT }));

&#x20; edges.forEach((e) => g.setEdge(e.source, e.target));

&#x20; dagre.layout(g);

&#x20; return nodes.map((n) => {

&#x20;   const pos = g.node(n.id);

&#x20;   return {

&#x20;     ...n,

&#x20;     position: { x: pos.x - NODE\_WIDTH / 2, y: pos.y - NODE\_HEIGHT / 2 },

&#x20;   };

&#x20; });

}

Position updates should animate. Set transition: transform 400ms var(--ease-out)

on the node wrapper — dagre positions translate smoothly.



4.3 Custom Node Component

One component ChromaNode.tsx handles all NodeKind values.



Dimensions: 220px wide, 96px tall (or 160px tall if it has an image artifact).



Visual structure:



Outer container: border-radius 10px, border 1px solid, background --bg-elevated.

Border color reflects status:



PENDING: var(--border), text-tertiary for icon



READY: #3b82f6 (blue)



RUNNING: var(--amber)



SUCCEEDED: var(--green)



FAILED: var(--red)



SKIPPED: var(--border), opacity 0.5



REGENERATING: var(--purple)



Padding: 12px.



Header row: icon (20x20 inline SVG, colored by status) + label

(Inter 500 13px, --text-primary, truncated).



Body row: kind label (JetBrains Mono 11px, --text-tertiary, uppercase)



attempts count if > 1 ("· attempt 2/3").



If node has an IMAGE artifact: append a 196x100 image below, border-radius 6px,

object-fit cover, src = /api/artifacts/{artifactId}.



If node has a numeric score: a small pill at the top-right corner,

background --bg-subtle, border 1px --border, border-radius 999px,

padding 2px 8px, JetBrains Mono 11px. Color: green if >= 0.7, amber if 0.4-0.7,

red if < 0.4.



RUNNING state pulse:



css

.chroma-node\[data-status="RUNNING"] {

&#x20; box-shadow: 0 0 0 1px var(--amber), 0 0 12px rgba(245, 158, 11, 0.2);

&#x20; animation: node-pulse 1.4s var(--ease-in-out) infinite alternate;

}

@keyframes node-pulse {

&#x20; from { box-shadow: 0 0 0 1px var(--amber), 0 0 8px rgba(245, 158, 11, 0.15); }

&#x20; to   { box-shadow: 0 0 0 1px var(--amber), 0 0 16px rgba(245, 158, 11, 0.35); }

}

@media (prefers-reduced-motion: reduce) {

&#x20; .chroma-node\[data-status="RUNNING"] { animation: none; }

}

Node entry (for regeneration nodes appearing mid-run):



css

.chroma-node {

&#x20; transition: transform 400ms var(--ease-out),

&#x20;             opacity 200ms var(--ease-out),

&#x20;             box-shadow 300ms var(--ease-out),

&#x20;             border-color 300ms var(--ease-out);

&#x20; @starting-style {

&#x20;   opacity: 0;

&#x20;   transform: scale(0.95);

&#x20; }

}

Selected node: 2px border in --accent.



4.4 Edges

Default React Flow edges, but styled:



Stroke: 1.5px var(--border)



When source node is SUCCEEDED: stroke var(--green), opacity 0.4



When source is RUNNING: use React Flow's animated dash array + animated prop true,

stroke var(--amber)



When target is SKIPPED: stroke dashed, opacity 0.3



Edge type: smoothstep (right-angle bends, cleaner for DAGs).



4.5 Empty State

When no run is loaded: centered message in --text-tertiary.



text

&#x20;             Type a brief and press Run.

&#x20;       The graph will appear here as agents fire.

Font: Inter 400 14px. Small mono glyph above: a 48px hexagon outline in

\--border with a pulsing opacity.



5\. Right Inspector

Slides in from the right when a node is selected. Width 380px. Full height.



css

.inspector {

&#x20; position: absolute;

&#x20; right: 0;

&#x20; top: 0;

&#x20; height: 100%;

&#x20; width: 380px;

&#x20; background: var(--bg-elevated);

&#x20; border-left: 1px solid var(--border);

&#x20; transform: translateX(100%);

&#x20; transition: transform 280ms var(--ease-out);

&#x20; overflow-y: auto;

}

.inspector\[data-open="true"] {

&#x20; transform: translateX(0);

}

@media (prefers-reduced-motion: reduce) {

&#x20; .inspector { transition: none; }

}

Content, top to bottom:



Header row: node kind (JetBrains Mono 11px, uppercase, --text-tertiary)



close button (X icon, 20x20, top-right).



Node label in Synonym 600 20px, --text-primary.



Status badge + timing (started → ended, or "running for 3.2s" if active).



Tab row: Input | Output | Artifact. Underline tabs.



Input tab: <pre> with pretty-printed inputJson. Font JetBrains Mono 12px,

background --bg, padding 12px, border-radius 8px, max-height 400px, overflow auto.



Output tab: same treatment for outputJson.



Artifact tab: if node has an IMAGE artifact, render it full-width

(max 340px wide), border-radius 8px, src = /api/artifacts/{id}.

Below it: metadata (mimeType, width, height, sha256 truncated).

If no artifact: "No artifact for this node yet."



Error section (only if node status is FAILED): a card with red border,

background rgba(239, 68, 68, 0.08), error message in JetBrains Mono 12px.



Pressing Escape closes the inspector.



6\. Live Updates via SSE

6.1 Connection

On run load (new run created OR clicked from recent):



ts

const source = new EventSource(`/api/runs/${runId}/events?from=${lastSequence}`);

lastSequence is 0 for new runs, or the snapshot's latestSequence for existing runs.



6.2 Event Handling

State is a reducer. Each event maps to an action.



ts

type Event = {

&#x20; type: string;

&#x20; runId: string;

&#x20; nodeId?: string;

&#x20; sequence: number;

&#x20; payload: unknown;

&#x20; createdAt: string;

};

Handlers:



Event type	State change

run.created	Set run from payload

node.created	Append to nodes. Include position: { x: 0, y: 0 }; layout happens after

edge.created	Append to edges

node.status	Update node.status. Trigger re-layout only if new node was added

node.started	Update node.status = RUNNING, node.startedAt

node.progress	Update node.progressPercent (optional field)

node.artifact	Fetch artifact metadata via GET /api/runs/:id, merge into artifacts map. Trigger re-layout (node height changes if image present)

node.failed	Set node.status = FAILED, store node.error

node.regenerating	Append new regeneration node and edge, mark original as REGENERATING

run.completed	Set run.status, close EventSource

After each event, update lastSequence = max(lastSequence, event.sequence).



6.3 Reconnection

If EventSource fires onerror:



Close the source.



Set connectionStatus to 'reconnecting'.



Wait 1s, then retry with ?from=${lastSequence}.



On successful onopen: set connectionStatus to 'connected'.



On second consecutive error: wait 2s, then 4s. Cap at 8s.



After 5 failed attempts: set connectionStatus to 'closed' and stop.



Also: on reconnect, fetch GET /api/runs/:id to fill any gaps in case events

were missed while disconnected.



6.4 Cleanup

On component unmount OR when the user starts a new run:



Close the existing EventSource.



Reset state for the new run.



7\. URL and Navigation

Route: /run



Optional query param: ?id=<runId> to load an existing run on mount.



If no ?id, show empty state until user runs a brief.



After creating a run, update URL: history.replaceState({}, '', /run?id=${runId}) —

do not trigger a navigation.



"Home" link in top-left corner of the sidebar (small, --text-tertiary) routes to /.



8\. Backend Additions

Two additions needed in the Next.js API:



8.1 GET /api/runs

Returns up to 20 most recent runs, newest first:



ts

// apps/web/app/api/runs/route.ts — add a GET handler

export async function GET() {

&#x20; const runs = await prisma.run.findMany({

&#x20;   orderBy: { createdAt: 'desc' },

&#x20;   take: 20,

&#x20;   select: {

&#x20;     id: true,

&#x20;     brief: true,

&#x20;     status: true,

&#x20;     createdAt: true,

&#x20;   },

&#x20; });

&#x20; return Response.json({ runs });

}

8.2 POST /api/runs response shape

Verify the POST handler returns { runId } in the JSON body. If it only

returns a Location header or is otherwise shaped differently, add runId

to the body. The frontend depends on this.



9\. Animation Rules (carry over from frontend.md)

All of section 6 of frontend.md applies here. Specifically for this page:



Inspector slide: 280ms --ease-out on transform only.



Node position changes from layout: 400ms --ease-out on transform.



Node entry (new regen nodes): 220ms --ease-out from scale(0.95) + opacity 0.



Edge appearance: no animation; edges just appear.



Selected node highlight: 180ms --ease-out on border-color.



Tab underline movement: 200ms --ease-out on transform (use a moving underline,

not a border-bottom swap).



Recent run item press: scale(0.99) on :active, 120ms.



Connection status dot pulse (reconnecting): 1.2s --ease-in-out infinite alternate,

opacity 0.4 to 1.



No transition: all anywhere.



Hover states gated behind @media (hover: hover) and (pointer: fine).



Respect prefers-reduced-motion: reduce — disable transform-based motion,

keep opacity transitions.



10\. Icons per NodeKind

Inline SVGs, 20x20, stroke-width 1.5, colored by node status:



PLAN — a target/bullseye (concentric circles with a center dot)



STYLE\_ANALYSIS — a palette (three dots inside a rounded blob)



PROMPT\_COMPILE — a document with lines



IMAGE\_GENERATE — a picture frame with a mountain and sun



IMAGE\_EDIT — the picture frame with a small wand overlay



CONSISTENCY\_CHECK — two overlapping squares with a checkmark



CRITIQUE — a star outline



GATE — a diamond (decision node shape)



COMPOSE — a 2x2 grid



11\. Files to Create

text

apps/web/app/run/page.tsx

apps/web/components/app/Sidebar.tsx

apps/web/components/app/BriefInput.tsx

apps/web/components/app/RecentRuns.tsx

apps/web/components/app/Canvas.tsx

apps/web/components/app/ChromaNode.tsx

apps/web/components/app/Inspector.tsx

apps/web/components/app/ConnectionDot.tsx

apps/web/lib/useRunStream.ts        (custom hook for SSE + reducer)

apps/web/lib/layout.ts              (dagre wrapper)

apps/web/lib/runTypes.ts            (TypeScript types for Run, Node, Edge, Event)

Page.tsx is a client component ("use client"). It owns the reducer state and

passes down.



12\. What NOT to Build

No authentication.



No run deletion or editing.



No multi-run comparison view.



No export to PDF or download button (skip this entirely).



No theme toggle.



No notifications or toasts beyond the connection dot.



No settings panel.



No keyboard shortcuts beyond Escape to close the inspector.



No mobile-specific interactions beyond responsive collapse.



13\. Verification Criteria

After implementation, confirm:



□ pnpm typecheck exits 0

□ pnpm build exits 0

□ Page renders at /run with the three regions visible

□ Typing a brief and clicking Run creates a run and opens the SSE stream

□ Nodes appear on the canvas as node.created events arrive

□ Node status updates in real time (RUNNING → SUCCEEDED / FAILED)

□ Image thumbnails appear inside IMAGE\_GENERATE nodes after node.artifact

□ Clicking a node opens the inspector with the correct data

□ Pressing Escape closes the inspector

□ The connection dot is green when connected, amber when reconnecting

□ Recent runs list populates from GET /api/runs

□ Clicking a recent run loads its graph and starts its SSE stream

□ Dagre layout produces a clean top-to-bottom flow with parallel branches side by side

□ Regeneration nodes appear during the run without breaking layout

□ No transition: all in the new code

□ Hover states gated correctly

□ prefers-reduced-motion: reduce disables node pulse and inspector slide

□ The page works at 1440px, 1024px, and 768px viewport widths

14\. Demo-Specific Polish

These details make the difference in a 3-minute video:



When a new run starts, the graph builds up node by node rather than appearing

all at once. Nodes enter with stagger as events arrive — this is already natural

since events arrive over time, but confirm it feels right (nodes should not

pop in all at the same millisecond).



The RUNNING pulse on a node is visible but not distracting. It should look like

a slow breathing glow, not a strobe.



When the run completes, all SUCCEEDED nodes flash green briefly (a one-time

200ms box-shadow fade) before settling. This is a single CSS class applied

when the run.completed event arrives, then removed after the animation.



The composed result (COMPOSE node's artifact) renders larger than others —

maybe 320x200. This is the payoff the viewer sees at the end.



The inspector's artifact tab shows the image at a size that is actually viewable

(max 340px wide), not thumbnail-size.



15\. Handoff

After this page is built and passing all checks:



The product is functionally complete.



Remaining work: Vercel deploy, R2 artifact storage swap, demo video, write-up.



Do not add features beyond what is specified here. Time is the constraint.



text



\---



\## Step 2 — Master prompt



Paste this into your IDE agent.



```text

Build the Chroma app page at /run. This is the interactive canvas where the

engine's activity is visualized. The landing page at / is done and must not

be touched.



BEFORE WRITING CODE



1\. Read chroma/app.md end to end. It is the authoritative specification for this

&#x20;  page. Section 4 (canvas), section 5 (inspector), section 6 (SSE), and section 9

&#x20;  (animations) are non-negotiable.

2\. Re-read chroma/frontend.md sections 3 (tokens) and 6 (animation rules). The

&#x20;  app page must use the same tokens, easing curves, and animation discipline.

3\. Run: npx skills@latest add emilkowalski/skills

&#x20;  Read the installed SKILL.md if you have not already. Apply its principles.



WHAT TO BUILD



A three-region layout at apps/web/app/run/page.tsx:



\- Left sidebar (300px): brief input, run button, connection indicator, recent runs list.

\- Center canvas (flex-grow): React Flow graph with custom Chroma node components,

&#x20; dagre auto-layout, live SSE updates.

\- Right inspector (380px, slide-in): tabs for Input / Output / Artifact, opened

&#x20; by clicking a node, closed with Escape or the X button.



Live updates via Server-Sent Events from /api/runs/:id/events. Reconnect logic

with sequence-based replay. Connection status indicator.



Install: @xyflow/react dagre @types/dagre



Files to create (see section 11 of app.md for the full list):

\- apps/web/app/run/page.tsx (client component)

\- apps/web/components/app/\* (8 components)

\- apps/web/lib/useRunStream.ts (SSE hook + reducer)

\- apps/web/lib/layout.ts (dagre wrapper)

\- apps/web/lib/runTypes.ts



Backend additions (section 8 of app.md):

\- Add a GET handler to apps/web/app/api/runs/route.ts returning the 20 most

&#x20; recent runs (id, brief, status, createdAt).

\- Verify POST /api/runs returns { runId } in the body. If not, add it.



ANIMATION RULES (mandatory)



\- Never use `ease`, `ease-in`, `ease-out`, or `linear`. Use --ease-out or --ease-in-out.

\- All UI transitions under 300ms except:

&#x20; - Dagre layout transitions: 400ms

&#x20; - Inspector slide: 280ms

\- Only animate `transform` and `opacity`.

\- Never animate from `scale(0)`. Minimum `scale(0.95)` + `opacity: 0`.

\- Button :active gets scale(0.97), 120ms.

\- Recent run item :active gets scale(0.99), 120ms.

\- Hover states gated behind @media (hover: hover) and (pointer: fine).

\- Respect @media (prefers-reduced-motion: reduce). Disable node pulse and inspector

&#x20; slide under reduced motion; keep opacity transitions.

\- Never use `transition: all`.

\- No animation library. CSS only.



NODE COMPONENT



One component handles all NodeKind values. Dimensions 220x96 (or 220x160 if it has

an image artifact). Border color reflects status. Icon on the left in the node's

status color. Label in Inter 500 13px. If the node has an image artifact, show a

196x100 thumbnail below the header using /api/artifacts/{id} as the img src. If

the node has a numeric score, show a small pill in the top-right corner colored

by score (green >= 0.7, amber 0.4-0.7, red < 0.4).



RUNNING pulse: a slow breathing box-shadow, 1.4s ease-in-out infinite alternate.

Disabled under reduced-motion.



SSE HANDLING



EventSource to /api/runs/:id/events?from=<lastSequence>. Reducer handles all event

types listed in section 6.2 of app.md. Reconnect with exponential backoff capped

at 8s, max 5 attempts. On reconnect, fetch the snapshot to fill gaps.



Escape key closes the inspector. Component unmount closes the EventSource.



VERIFY



Run:

\- pnpm typecheck (exit 0)

\- pnpm build (exit 0)



Then start the dev server, open http://localhost:3000/run, and walk through the

checklist in section 13 of app.md. Report PASS/FAIL for each item.



CRITICAL VERIFICATION: create a real run. Paste a brief, click Run, watch nodes

appear and update. Confirm at least one IMAGE artifact renders inside its node.

Click a node to open the inspector and confirm data is correct.



CONSTRAINTS



\- Do not modify the landing page (apps/web/app/page.tsx, apps/web/app/globals.css

&#x20; tokens, or any components under apps/web/components/landing/).

\- Do not modify provider adapters, scheduler, executors, or the Prisma schema.

\- Do not add new dependencies beyond @xyflow/react, dagre, and @types/dagre.

\- Do not commit .env, .env.local, or any secret.



COMMIT



One commit: "feat(web): react flow canvas, inspector, and live sse updates"



FINAL REPORT



\- Files created and modified

\- pnpm typecheck / build exit codes

\- The checklist from app.md section 13 with PASS/FAIL

\- A screenshot or description of the rendered canvas mid-run

\- Any SSE events you did not handle with their payload shape

\- Any deviations from app.md and why



STOPPING CONDITIONS



\- All checklist items PASS: stop and report.

\- Two failed fix attempts on the same issue: stop and report the exact error,

&#x20; what you tried, and your hypothesis about the cause. Do not loop.



arkdown

\## 16. Apple Design Addendum



Beyond Emil's web-focused rules, this page must also follow the Apple design

skill's principles. These override or extend sections 4, 5, and 9 where relevant.



\### 16.1 Springs over curves for spatial motion



The inspector slide and node position changes use spring-like easing, not

cubic-bezier. Use CSS `linear()` easing to approximate a spring:



```css

\--spring-smooth: linear(

&#x20; 0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%,

&#x20; 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%,

&#x20; 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%,

&#x20; 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1

);

\--spring-bouncy: linear(

&#x20; 0, 0.003, 0.028 2.9%, 0.096 4.8%, 0.42 11.4%, 0.698 15.2%,

&#x20; 0.918 18.9%, 1.024 21.8%, 1.075 24.6%, 1.096 26.5%, 1.099 28.8%,

&#x20; 1.082 32.3%, 1.054 36.7%, 1.021 41.6%, 0.999 46.6%, 0.991 51.5%,

&#x20; 0.995 57.5%, 1.001 64.4%, 1

);

Apply:



Inspector slide: transform 340ms var(--spring-smooth) (was 280ms cubic-bezier)



Node position changes from dagre: transform 460ms var(--spring-smooth)



Node entry (regen): transform 260ms var(--spring-bouncy), opacity 200ms var(--ease-out)



Under @media (prefers-reduced-motion: reduce), fall back to instant or

opacity-only.



16.2 Interruptible animations

The inspector must retarget smoothly when the user clicks a different node while

it is sliding or already open.



Implementation: do NOT toggle a class that swaps transform: translateX(100%)

for translateX(0). Instead, set the target translate via a CSS variable:



css

.inspector {

&#x20; transform: translateX(var(--inspector-x, 100%));

&#x20; transition: transform 340ms var(--spring-smooth);

}

When open: element.style.setProperty('--inspector-x', '0%').

When closed: element.style.setProperty('--inspector-x', '100%').



The browser will retarget mid-flight — no restart, no jump. This is the Apple

"interruptible" principle applied to a web component.



Apply the same pattern to any future slide-in or slide-out panel.



16.3 Pointer-down feedback

In addition to :active, buttons on this page respond on pointer-down (not

just click-release). This is subtle — a faster, quieter version of the press.



css

.run-button, .recent-run-item, .button-primary {

&#x20; transition: transform 120ms var(--ease-out), opacity 160ms var(--ease-out);

}

Attach a pointerdown handler that adds data-pressed="true":



ts

onPointerDown={(e) => {

&#x20; (e.currentTarget as HTMLElement).dataset.pressed = 'true';

}}

onPointerUp={(e) => {

&#x20; delete (e.currentTarget as HTMLElement).dataset.pressed;

}}

onPointerLeave={(e) => {

&#x20; delete (e.currentTarget as HTMLElement).dataset.pressed;

}}

CSS:



css

.run-button\[data-pressed="true"] { transform: scale(0.97); }

Why both :active and pointerdown: :active covers keyboard/spacebar

activation. pointerdown fires \~50ms earlier and feels snappier.



16.4 Distance-aware duration for dagre layout

Not all layout changes are the same size. A node moving 20px shouldn't take the

same time as one moving 400px.



After dagre runs, compute the maximum node displacement. Set the transition

duration proportionally:



ts

const maxDelta = Math.max(...nodes.map((n) => {

&#x20; const old = previousPositions.get(n.id);

&#x20; if (!old) return 0;

&#x20; return Math.hypot(n.position.x - old.x, n.position.y - old.y);

}));

const duration = Math.min(600, 200 + maxDelta \* 0.6); // 200ms floor, 600ms ceiling

document.documentElement.style.setProperty('--layout-duration', `${duration}ms`);

CSS uses transition: transform var(--layout-duration, 400ms) var(--spring-smooth).



This is the Apple "velocity-aware motion" principle: bigger moves take longer,

but never past a perception threshold.



16.5 Continuity between list and canvas

When the user clicks a recent run in the sidebar, the canvas should not just

"swap." The old graph fades out over 160ms while the new one fades in over

260ms, offset by 100ms so there is a brief overlap. This reads as a transition,

not a cut.



css

.canvas-content { transition: opacity 160ms var(--ease-out); }

.canvas-content\[data-state="exiting"] { opacity: 0; }

.canvas-content\[data-state="entering"] {

&#x20; opacity: 1;

&#x20; transition: opacity 260ms var(--ease-out) 100ms;

&#x20; @starting-style { opacity: 0; }

}

16.6 React Flow drag feel

React Flow's default node drag is functional but stiff. Apply these props on

the ReactFlow component:



tsx

<ReactFlow

&#x20; nodesDraggable={true}

&#x20; nodesConnectable={false}

&#x20; panOnDrag={\[1, 2]}       // middle and right mouse button pan

&#x20; selectionOnDrag={false}

&#x20; zoomOnDoubleClick={false}

&#x20; preventScrolling={true}

&#x20; {...}

/>

Do not add custom drag physics — React Flow's built-in uses pointer deltas and

is already reasonable. The Apple principle here is: don't fight the platform,

just remove the jarring bits (double-click zoom, node connect popups).



text



\---



\## Patch 2 — Add to the master prompt



Before you run the master prompt, add this line to the "ANIMATION RULES" section:



```text

Additionally, read and apply section 16 (Apple Design Addendum) at the end of

app.md. It adds:

\- Spring easing for inspector slide and node layout (linear() approximation)

\- Interruptible inspector using a CSS variable, not class toggle

\- Pointer-down feedback via data-pressed attribute

\- Distance-aware layout duration

\- Continuity fade between sidebar selections

\- React Flow props that remove jarring defaults





