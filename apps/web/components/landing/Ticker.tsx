const phrases = [
  "Plan the pipeline",
  "Analyze the style",
  "Lock the palette",
  "Generate in parallel",
  "Score every frame",
  "Fix what drifted",
  "Compose the set",
];

function Star() {
  return (
    <svg
      className="ticker-star"
      aria-hidden="true"
      viewBox="0 0 12 12"
      fill="currentColor"
    >
      <path d="m6 0 1.45 4.55L12 6l-4.55 1.45L6 12 4.55 7.45 0 6l4.55-1.45L6 0Z" />
    </svg>
  );
}

function TickerRun({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="ticker-run" aria-hidden={duplicate || undefined}>
      {phrases.map((phrase) => (
        <span className="ticker-item" key={phrase}>
          {phrase}
          <Star />
        </span>
      ))}
    </div>
  );
}

export function Ticker() {
  return (
    <div className="ticker" aria-label={phrases.join(" ★ ")}>
      <div className="ticker-track">
        <TickerRun />
        <TickerRun duplicate />
      </div>
    </div>
  );
}
