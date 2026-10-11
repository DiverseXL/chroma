frontend.md — Chroma Landing Page Specification
markdown
# Chroma — Frontend Specification

## 1. Project Context

Chroma is a multi-agent image generation system. You type a creative brief in plain
English; a Planner agent builds a DAG of specialized steps; a scheduler runs
independent steps in parallel; Cloudflare Workers AI generates images; a Gemini
vision Critic scores every output and triggers regeneration on drift; a live React
Flow canvas shows the entire process. The name is locked. The product is image AI
from end to end.

This document specifies the **landing page** at the root route (`/`). The interactive
demo lives at `/run` and is specified separately.

Reference for tone, layout rhythm, and section sequencing: https://popper-3ei6.vercel.app/

## 2. Design Principles (from emil-design-eng)

### Taste is trained, not innate
Every decision below exists because the aggregate of invisible correctness creates
interfaces people love without knowing why. Don't just make it work — make it feel right.

### Unseen details compound
Most details users never consciously notice. That is the point. When a feature
functions exactly as someone assumes it should, they proceed without a second thought.

### Beauty is leverage
People select tools based on overall experience, not just functionality. Good
defaults and good animations are real differentiators. Use them.

## 3. Design Tokens

### Colors (dark theme only — no toggle)
```css
--bg:           #0a0a0a;
--bg-elevated:  #141414;
--bg-subtle:    #1a1a1a;
--border:       rgba(255, 255, 255, 0.08);
--border-hover: rgba(255, 255, 255, 0.16);
--text-primary: #f5f5f5;
--text-secondary: #a3a3a3;
--text-tertiary: #6b6b6b;
--accent:       #ff6b35;   /* warm orange — the "chroma" signal */
--accent-muted: rgba(255, 107, 53, 0.12);
--accent-glow:  rgba(255, 107, 53, 0.25);
--green:        #22c55e;   /* success states */
--amber:        #f59e0b;   /* running states */
--red:          #ef4444;   /* failure states */
--purple:       #a855f7;   /* regeneration states */
Typography
css
--font-display: 'Synonym', 'Chillax', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Consolas', monospace;

/* Scale */
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-4xl:  2.25rem;   /* 36px */
--text-6xl:  3.75rem;   /* 60px */
--text-8xl:  6rem;      /* 96px */
Load fonts:

css
@import url('https://api.fontshare.com/v2/css?f[]=synonym@400,500,600,700&f[]=chillax@600,700,800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
Easing curves (mandatory — never use built-in CSS easings)
css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
Duration scale
css
--duration-press:    120ms;   /* button press feedback */
--duration-fast:     160ms;   /* hover, color changes */
--duration-base:     200ms;   /* dropdowns, tooltips */
--duration-slow:     280ms;   /* modals, sections */
Spacing
css
--space-1:  0.25rem;
--space-2:  0.5rem;
--space-3:  0.75rem;
--space-4:  1rem;
--space-6:  1.5rem;
--space-8:  2rem;
--space-12: 3rem;
--space-16: 4rem;
--space-24: 6rem;
--space-32: 8rem;
Layout
css
--content-max:   1120px;
--content-narrow: 720px;
--header-height: 64px;
4. Page Structure
The page is a single vertical scroll with these sections, in order:

Header (fixed, translucent on scroll)

Hero

Ticker marquee

"See it work" — live demo preview

"What you get" — feature grid

Stats counters

FAQ accordion

Footer CTA

5. Section Specs
5.1 Header
Layout: Fixed top, full width, height 64px. Grid: [nav-left] [brand-center] [nav-right].

Transparent at scroll top, translucent with backdrop blur after 20px scroll:

css
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  z-index: 100;
  background: transparent;
  transition: background 200ms var(--ease-out),
              backdrop-filter 200ms var(--ease-out),
              border-color 200ms var(--ease-out);
  border-bottom: 1px solid transparent;
}
.header[data-scrolled="true"] {
  background: rgba(10, 10, 10, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--border);
}
Left nav: two text links — "How it works" (scrolls to #how-it-works), "Method" (scrolls to #method). Font: Inter 500, 14px, color --text-secondary. On hover: color transitions to --text-primary over 160ms ease.

Center brand: small mark (a 24×24 SVG: a hexagon with an orange gradient fill) + "Chroma" in Synonym 600, 16px, letter-spacing -0.01em. Clicking scrolls to top.

Right nav: GitHub icon link + "Launch app" button. Button spec below.

Launch app button:

css
.button-primary {
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--text-primary);
  color: var(--bg);
  font: 500 14px var(--font-body);
  border: none;
  cursor: pointer;
  transition: transform 120ms var(--ease-out),
              opacity 160ms var(--ease-out);
}
.button-primary:hover { opacity: 0.88; }
.button-primary:active { transform: scale(0.97); }
Entry animation: Header fades down from translateY(-8px) + opacity: 0 to translateY(0) + opacity: 1 over 400ms --ease-out, no delay. Uses @starting-style:

css
.header {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms var(--ease-out), transform 400ms var(--ease-out);
  @starting-style {
    opacity: 0;
    transform: translateY(-8px);
  }
}
5.2 Hero
Layout: Min-height calc(100vh - var(--header-height)), centered content, max-width --content-narrow, text-center. Padding-top: var(--header-height).

Background: Two faint radial glows fixed behind the hero — one top-left in --accent, one bottom-right in --purple. Opacity 0.06. No images. Use background: radial-gradient(circle at 20% 20%, var(--accent-glow), transparent 50%).

Content, top to bottom:

Logo mark: 72×72 SVG, same hexagon gradient, centered. Fades in first.

Headline (h1):

text
Turn a brief into a finished image set
"finished image set" wrapped in <span class="accent"> with color --accent.
Font: Synonym 700, clamp(2.5rem, 6vw, 4.5rem), line-height 1.05, letter-spacing -0.03em. Max-width 800px.

Lead paragraph:

text
Chroma is an AI Creative Director. Describe what you want in plain English.
A team of specialized agents plans the pipeline, generates images in parallel,
scores every frame with a vision critic, and delivers a coherent set — showing
the whole process live on a visual canvas.
Font: Inter 400, --text-lg, line-height 1.6, color --text-secondary, max-width 620px, margin-top --space-6.

CTA row: two buttons side by side.

Primary: "Run a brief" → /run. Spec: --button-primary above, but larger (12px 24px padding, 15px font).

Secondary: "See how it works" → scrolls to #how-it-works. Outline style: transparent bg, 1px solid --border, text --text-primary. Hover: border-color → --border-hover.

Entry animation (staggered): Each of the 4 elements fades up from translateY(12px) + opacity: 0 over 500ms --ease-out. Delays: logo 0ms, h1 80ms, lead 160ms, CTA 240ms. Use CSS with @starting-style and transition-delay, not a JS animation library.

Sub-hero detail: Below the CTA row, one small mono line in --text-tertiary:

text
> 4 panels · 8 agents · 1 run
Font: JetBrains Mono 400, --text-sm. Fades in with the CTA delay + 80ms.

5.3 Ticker Marquee
Layout: Full-width strip, 56px tall, border-top and border-bottom 1px --border, background --bg-elevated. Content scrolls horizontally, infinite loop.

Content (repeating sequence):

text
Plan the pipeline ★ Analyze the style ★ Lock the palette ★ Generate in parallel
★ Score every frame ★ Fix what drifted ★ Compose the set ★
Implementation:

css
.ticker {
  overflow: hidden;
  display: flex;
  user-select: none;
}
.ticker-track {
  display: flex;
  gap: var(--space-8);
  padding-left: var(--space-8);
  animation: ticker-scroll 40s linear infinite;
  will-change: transform;
}
@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
}
Duplicate the track content once so the loop is seamless (total track content = 2× the sequence).

Each item: Inter 500, --text-sm, color --text-secondary, letter-spacing 0.02em. Star separators: 12×12 SVG, color --accent, opacity 0.6.

5.4 "See it work" — Live Demo Preview
Anchor: #how-it-works. Padding: var(--space-24) 0.

Header block (centered):

Small eyebrow label: SEE IT WORK — JetBrains Mono 500, 11px, letter-spacing 0.1em, color --accent.

Section headline: Watch a brief become a graph become an image set — Synonym 600, clamp(1.75rem, 3.5vw, 2.5rem), line-height 1.15.

Sub-line: Every node is inspectable. Every score is logged. Every drift is caught. — Inter 400, --text-base, color --text-secondary.

Demo panel: A single rounded container, max-width 960px, centered, border 1px --border, background --bg-elevated, border-radius 16px, padding --space-6. Inside is a mock of the live canvas.

The mock shows a static snapshot of a Chroma run in progress:

Row 1: a planner node (status: succeeded, green ring)

Row 2: three nodes side by side — style_analysis (succeeded), panel1_prompt (succeeded), panel2_prompt (succeeded)

Row 3: two nodes — panel1_image (running, amber pulsing ring), panel2_image (running)

Row 4: a critic node (pending, gray)

Row 5: a compose node (pending)

Connecting lines between rows: 1px stroke, --border color. The running nodes have a subtle pulse on their ring.

Below the demo panel: a single row of three small "verdict" chips, centered:

text
✓ 4 panels planned    ✓ 2 in flight    ✓ 0 drifts so far
Each chip: Inter 500, --text-sm, background --bg-subtle, border 1px --border, border-radius 999px, padding 4px 12px. Checkmarks in --green.

Entry animation: the demo panel fades in from scale(0.98) + opacity: 0 over 400ms --ease-out when scrolled into view. Use IntersectionObserver with { once: true, margin: '-100px' } to trigger a data-visible="true" attribute. CSS:

css
.demo-panel {
  opacity: 1;
  transform: scale(1);
  transition: opacity 400ms var(--ease-out), transform 400ms var(--ease-out);
  @starting-style {
    opacity: 0;
    transform: scale(0.98);
  }
}
Never scale(0).

5.5 "What you get" — Feature Grid
Anchor: #method. Padding: var(--space-24) 0.

Header block:

Eyebrow: WHAT YOU GET

Headline: Less a generator, more a creative director with a memory

Sub-line: Every feature depends on image AI. Remove it and the product stops working.

Grid: 3 columns on desktop, 2 on tablet, 1 on mobile. Gap --space-4. Max-width --content-max.

Cards (6 total):

DAG Orchestration — "The planner compiles your brief into a directed acyclic graph. Nodes are validated, sorted, and scheduled with real topological ordering — not a chain of prompt calls."

Parallel Fan-Out — "Independent panels run at the same time. A four-panel storyboard fans out to four concurrent generations, then fans back in at the compose node."

Consistency Agent — "A vision model compares every panel against a shared style descriptor. Panels that drift get targeted edit instructions — preserving character identity and lighting across the set."

Critic Loop — "Every output is scored against a rubric. Below threshold triggers regeneration with the critic's feedback appended to the prompt. Bounded at two attempts per node."

Live Canvas — "The React Flow canvas lights up as each node runs. Click any node to inspect its prompt, its image, its score, and its timing."

Inspectable Artifacts — "Every prompt, every intermediate image, every critique is stored and addressable. Nothing is hidden behind a chat box."

Card spec:

css
.feature-card {
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  transition: border-color 200ms var(--ease-out),
              background 200ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .feature-card:hover {
    border-color: var(--border-hover);
    background: var(--bg-subtle);
  }
}
Card heading: Synonym 600, --text-xl, margin-bottom --space-2.
Card body: Inter 400, --text-base, color --text-secondary, line-height 1.6.

Each card has a small icon (20×20 SVG) at the top, colored --accent, margin-bottom --space-4.

Entry animation: Cards stagger in with 50ms delay between them (30–80ms range) when the grid enters the viewport. Each card: translateY(8px) + opacity: 0 → translateY(0) + opacity: 1 over 400ms --ease-out. Only animate transform and opacity.

5.6 Stats Counters
Layout: Full-width strip, padding var(--space-16) 0, border-top and border-bottom 1px --border, background --bg.

Three stats, centered, side by side:

text
0            0               0
RUNS         IMAGES          DRIFTS
EXECUTED     GENERATED       CAUGHT
Counter animation: Numbers count up from 0 to their target when the section enters the viewport. Use a small useCountUp hook or a CSS-driven counter. Numbers: Synonym 700, clamp(2.5rem, 5vw, 4rem), color --text-primary. Labels below: JetBrains Mono 500, 11px, letter-spacing 0.1em, color --text-tertiary.

Animation: Fade in from opacity: 0 over 300ms. Do not animate the number itself beyond the count-up. No bounce, no scale. A counter is functional, not decorative.

5.7 FAQ Accordion
Anchor: #faq. Padding: var(--space-24) 0. Max-width --content-narrow, centered.

Header:

Eyebrow: FAQ

Headline: Questions, answered

Accordion items (6):

"What exactly does Chroma do?" → "It turns a plain-English creative brief into a finished, coherent set of images. A planner builds a DAG, a scheduler runs it in parallel, image agents generate, a vision critic scores, and a composer assembles the final set."

"How is this different from a single image generator?" → "A single generator produces one image per prompt. Chroma produces a set that shares a visual language — same character, same palette, same lighting — by keeping the plan, the style, and the critique as first-class parts of the pipeline."

"What happens when an image scores below threshold?" → "The critic emits a regeneration event with specific feedback. The scheduler inserts a new image-generation node whose prompt appends the critic's issues as constraints. This is bounded at two attempts per node."

"Can I see how a result was reached?" → "Yes. Every node is inspectable on the canvas. Click a node to see its input, its output, its artifact, its score, and its timing. The full event log is replayable."

"Which models does it use?" → "Cloudflare Workers AI (FLUX schnell) for image generation, and Google Gemini for planning, style analysis, prompt writing, and vision critique. The provider layer is swappable."

"Is it open source?" → "Yes. The repo is public. Link in the header."

Accordion behavior:

Single item open at a time.

On open: the content expands from height: 0 to height: auto using the grid-template-rows: 0fr → 1fr trick (works without JS height measuring).

The chevron rotates 180deg on open.

Duration: 240ms --ease-out.

css
.faq-item {
  border-bottom: 1px solid var(--border);
}
.faq-trigger {
  width: 100%;
  padding: var(--space-4) 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: color 160ms var(--ease-out);
}
.faq-trigger:hover { color: var(--text-primary); }
.faq-chevron {
  transition: transform 240ms var(--ease-out);
}
.faq-item[data-open="true"] .faq-chevron {
  transform: rotate(180deg);
}
.faq-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--ease-out);
}
.faq-item[data-open="true"] .faq-content {
  grid-template-rows: 1fr;
}
.faq-content > div {
  overflow: hidden;
}
FAQ question text: Inter 500, --text-lg, color --text-primary.
FAQ answer text: Inter 400, --text-base, color --text-secondary, line-height 1.6, padding-bottom var(--space-4).

5.8 Footer CTA
Layout: Padding var(--space-32) 0 var(--space-16), centered, max-width --content-narrow.

Content:

Headline: Ready to see what survives the brief? — Synonym 600, clamp(1.75rem, 4vw, 2.5rem).

Sub-line: Type a brief. Watch the graph light up. Get a set that holds together. — Inter 400, --text-lg, color --text-secondary.

Button: "Open Chroma" → /run. Same spec as the hero primary CTA.

Below the CTA, a footer bar:

text
Built for Banana Hacks 2026 · Chroma · MIT
Inter 400, --text-sm, color --text-tertiary, centered, margin-top var(--space-16), padding-top var(--space-6), border-top 1px --border.

6. Animation Rules (mandatory)
These are non-negotiable. The agent must follow them.

Rule	Detail
Easing	Never use ease, ease-in, ease-out, or linear for UI. Use the custom --ease-out / --ease-in-out tokens.
Duration	All UI transitions under 300ms. Button press 120ms. Hover 160ms. Dropdown 200ms. Accordion 240ms.
Properties	Only animate transform and opacity. Never animate width, height, padding, margin, top, left.
Entry animations	Never from scale(0). Minimum scale(0.95) + opacity: 0.
Button press	Always transform: scale(0.97) on :active, 120ms --ease-out.
Popovers / tooltips	transform-origin: var(--transform-origin) — scale from the trigger, not center.
Modals	transform-origin: center — modals are exempt.
Hover states	Gate behind @media (hover: hover) and (pointer: fine).
Reduced motion	Respect prefers-reduced-motion: reduce. Remove transform-based motion, keep opacity and color transitions.
Stagger	30–80ms between items. Never block interaction while stagger plays.
Scroll triggers	Use IntersectionObserver with { once: true, margin: '-100px' }. Never animate on every scroll event.
transition: all	Never. Specify exact properties.
7. Responsive Breakpoints
css
/* mobile:      < 640px  — single column, reduced hero size */
/* tablet:      640–1023px — two columns for feature grid */
/* desktop:     >= 1024px — full layout */
Hero headline: clamp(2.5rem, 6vw, 4.5rem) — scales fluidly.
Section headlines: clamp(1.75rem, 3.5vw, 2.5rem).
Feature grid: grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)).
Header nav links: hidden below 640px, replaced by a single "Launch app" button.

8. Implementation Notes
Framework: Next.js 15 App Router. Page at apps/web/app/page.tsx.

Styling: Tailwind for utility classes + a globals.css with the tokens above as CSS custom properties. Do not use inline style attributes for animation values — put them in CSS.

Fonts: loaded via next/font or the @import statements above. Prefer next/font for Inter and JetBrains Mono, @import for Synonym and Chillax.

Icons: inline SVGs only. No icon library. 20×20 or 24×24, stroke-width 1.5.

No animations library. No Framer Motion, no AOS, no GSAP. Use CSS transitions and @starting-style. The only JS-driven animation is the stats counter and the accordion toggle.

No useEffect for entry animations. Use @starting-style or IntersectionObserver + a data-visible attribute.

Accessibility: All interactive elements are <button> or <a>. Focus rings visible: outline: 2px solid var(--accent); outline-offset: 2px.

Meta: title: "Chroma — AI Creative Director". description: "A multi-agent image generation system that turns a brief into a coherent image set."

9. Verification Criteria
After implementation, confirm:

□ pnpm typecheck exits 0
□ pnpm build exits 0
□ No transition: all anywhere in the codebase
□ No ease-in or built-in ease-out in CSS — only the custom curves
□ No scale(0) entry animations
□ Every button has :active { transform: scale(0.97) }
□ prefers-reduced-motion media query is present and disables transform-based motion
□ Hover states are gated behind @media (hover: hover) and (pointer: fine)
□ Page renders on mobile, tablet, and desktop without horizontal scroll
□ The ticker scrolls smoothly and loops seamlessly
□ The FAQ accordion opens one item at a time with a 240ms transition
□ The stats counters count up on scroll into view
□ All six feature cards fade in with stagger when the grid enters the viewport
10. What NOT to Build
No dark/light theme toggle. Dark only.

No authentication or login UI.

No testimonials section. There are no users yet.

No pricing section. It's free.

No blog, changelog, or docs section. The repo is the docs.

No cookie banner. No newsletter signup.

No carousel of screenshots. The live demo panel is the proof.

No hero video. The ticker and the demo panel carry the motion.

text

---

## How to use this

1. **Save the file** at `chroma/frontend.md`.
2. **Then paste this into your IDE agent:**

```text
Read chroma/frontend.md. It is the full specification for the Chroma landing page.

Build the landing page exactly as specified. The design tokens, section structure,
animation rules, and verification criteria are all in that file.

Pre-flight:
- Run npx skills@latest add emilkowalski/skills and read the emil-design-eng SKILL.md
  at node_modules/.skills/emil-design-eng/SKILL.md before writing any code.
- Confirm the file exists at chroma/frontend.md and read it end to end.

Build order:
1. globals.css with the design tokens (colors, fonts, easing, durations, spacing).
2. Header component.
3. Hero section.
4. Ticker marquee.
5. Demo preview section.
6. Feature grid.
7. Stats counters.
8. FAQ accordion.
9. Footer CTA.
10. Page assembly at apps/web/app/page.tsx.

Constraints:
- Do not use any animation library. CSS transitions + @starting-style only.
- Do not use transition: all anywhere.
- Do not use ease-in or built-in ease-out. Only the custom curves from the spec.
- Do not animate from scale(0). Minimum scale(0.95) + opacity: 0.
- Every button gets :active { transform: scale(0.97) }.
- Gate hover states behind @media (hover: hover) and (pointer: fine).
- Respect prefers-reduced-motion.
- Only animate transform and opacity.

Verify:
- pnpm typecheck exits 0
- pnpm build exits 0
- Start the dev server and confirm the page renders. Walk through the checklist
  in section 9 of frontend.md. Report PASS/FAIL for each.

Commit with message "feat(web): chroma landing page with emil-design-eng principles".

Report: files created, exit codes, checklist results, and any deviations from the spec.
The spec is complete, the inspiration is analyzed, and the skill is embedded. Run it.

