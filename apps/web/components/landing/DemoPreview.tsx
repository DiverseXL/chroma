interface DemoNodeProps {
  label: string;
  status: "succeeded" | "running" | "pending";
}

function DemoNode({ label, status }: DemoNodeProps) {
  return (
    <div className={`demo-node status-${status}`}>
      <span className="status-ring" aria-hidden="true" />
      <span className="demo-node-copy">
        <span className="demo-node-name">{label}</span>
        <span className="demo-node-state">{status.replace("-", " ")}</span>
      </span>
    </div>
  );
}

function Connectors() {
  return (
    <svg
      className="demo-connectors"
      aria-hidden="true"
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1">
        <path d="M400 40v28L200 120M400 68V120M400 68 600 120" />
        <path d="M200 120v26l100 54M400 120l-100 80M600 120l100 26-200 54M600 120 500 200" />
        <path d="M300 200v30l100 50M500 200v30L400 280" />
        <path d="M400 280v80" />
      </g>
    </svg>
  );
}

export function DemoPreview() {
  return (
    <section
      className="demo-section section-space"
      id="how-it-works"
      aria-labelledby="demo-title"
    >
      <div className="content-width">
        <header className="section-intro">
          <span className="eyebrow">SEE IT WORK</span>
          <h2 className="section-heading" id="demo-title">
            Watch a brief become a graph become an image set
          </h2>
          <p className="section-copy">
            Every node is inspectable. Every score is logged. Every drift is
            caught.
          </p>
        </header>

        <div className="demo-panel" data-reveal data-visible="false">
          <div className="demo-stage" aria-label="Static preview of a Chroma run">
            <Connectors />
            <div className="demo-row">
              <DemoNode label="planner" status="succeeded" />
            </div>
            <div className="demo-row demo-row-three">
              <DemoNode label="style_analysis" status="succeeded" />
              <DemoNode label="panel1_prompt" status="succeeded" />
              <DemoNode label="panel2_prompt" status="succeeded" />
            </div>
            <div className="demo-row demo-row-two">
              <DemoNode label="panel1_image" status="running" />
              <DemoNode label="panel2_image" status="running" />
            </div>
            <div className="demo-row">
              <DemoNode label="critic" status="pending" />
            </div>
            <div className="demo-row">
              <DemoNode label="compose" status="pending" />
            </div>
          </div>
        </div>

        <ul className="verdicts" aria-label="Run summary">
          {["4 panels planned", "2 in flight", "0 drifts so far"].map((text) => (
            <li className="verdict-chip" key={text}>
              <span className="verdict-check" aria-hidden="true">
                ✓
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
