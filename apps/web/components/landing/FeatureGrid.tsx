import type { ReactNode } from "react";

const features = [
  {
    title: "DAG Orchestration",
    copy: "The planner compiles your brief into a directed acyclic graph. Nodes are validated, sorted, and scheduled with real topological ordering — not a chain of prompt calls.",
    icon: (
      <>
        <circle cx="10" cy="4" r="2.25" />
        <circle cx="4" cy="16" r="2.25" />
        <circle cx="16" cy="16" r="2.25" />
        <path d="M9 6 5 14m5-8 5 8" />
      </>
    ),
  },
  {
    title: "Parallel Fan-Out",
    copy: "Independent panels run at the same time. A four-panel storyboard fans out to four concurrent generations, then fans back in at the compose node.",
    icon: (
      <>
        <path d="M3 5h5a4 4 0 0 1 4 4v6a4 4 0 0 0 4 4h5M3 12h6m0 0-3-3m3 3-3 3m12-10-3-3m3 3-3 3" />
      </>
    ),
  },
  {
    title: "Consistency Agent",
    copy: "A vision model compares every panel against a shared style descriptor. Panels that drift get targeted edit instructions — preserving character identity and lighting across the set.",
    icon: (
      <>
        <path d="M2.5 10s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 10 2.5 10Z" />
        <circle cx="12" cy="10" r="2.5" />
        <path d="M5 19h14" />
      </>
    ),
  },
  {
    title: "Critic Loop",
    copy: "Every output is scored against a rubric. Below threshold triggers regeneration with the critic's feedback appended to the prompt. Bounded at two attempts per node.",
    icon: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 9a7 7 0 0 1 11.8-2L20 12M4 12l2.7 5a7 7 0 0 0 11.8-2" />
      </>
    ),
  },
  {
    title: "Live Canvas",
    copy: "The React Flow canvas lights up as each node runs. Click any node to inspect its prompt, its image, its score, and its timing.",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="6" rx="1.5" />
        <rect x="14" y="15" width="7" height="6" rx="1.5" />
        <path d="M10 6h3a2 2 0 0 1 2 2v7M7 9v4a2 2 0 0 0 2 2h5" />
      </>
    ),
  },
  {
    title: "Inspectable Artifacts",
    copy: "Every prompt, every intermediate image, every critique is stored and addressable. Nothing is hidden behind a chat box.",
    icon: (
      <>
        <path d="M6 2.75h8l4 4v14.5H6a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5M8 13h8m-8 4h8" />
      </>
    ),
  },
];

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="feature-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function FeatureGrid() {
  return (
    <section className="feature-section section-space" id="method">
      <div className="content-width">
        <header className="section-intro">
          <span className="eyebrow">WHAT YOU GET</span>
          <h2 className="section-heading">
            Less a generator, more a creative director with a memory
          </h2>
          <p className="section-copy">
            Every feature depends on image AI. Remove it and the product stops
            working.
          </p>
        </header>

        <div className="feature-grid">
          {features.map((feature) => (
            <article
              className="feature-card"
              data-reveal
              data-visible="false"
              key={feature.title}
            >
              <FeatureIcon>{feature.icon}</FeatureIcon>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-copy">{feature.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
