const STARTING_NODES = [
  { x: 4, width: 46, delay: "0s" },
  { x: 70, width: 44, delay: "0.55s" },
  { x: 134, width: 46, delay: "1.1s" },
] as const;

export function RunStarting() {
  return (
    <div className="run-starting" role="status" aria-live="polite">
      <svg
        className="run-starting-graph"
        viewBox="0 0 184 60"
        fill="none"
        aria-hidden="true"
      >
        <path className="run-starting-wire" d="M50 30H70" />
        <path className="run-starting-wire" d="M114 30H134" />
        {STARTING_NODES.map((node) => (
          <rect
            key={node.x}
            className="run-starting-node"
            x={node.x}
            y={14}
            width={node.width}
            height={32}
            rx={8}
            style={{ animationDelay: node.delay }}
          />
        ))}
        <circle className="run-starting-pulse" cx="0" cy="30" r="2.5" />
      </svg>
      <p className="run-starting-title">Preparing run</p>
      <span className="run-starting-copy">
        Waking the database and compiling the graph. Cold starts can take a few
        seconds.
      </span>
    </div>
  );
}
