import { CountUp } from "./CountUp";

const stats = [
  { target: 1247, lines: ["RUNS", "EXECUTED"] },
  { target: 8934, lines: ["IMAGES", "GENERATED"] },
  { target: 412, lines: ["DRIFTS", "CAUGHT"] },
];

export function Stats() {
  return (
    <section className="stats-section" aria-label="Chroma stats" data-reveal>
      <div className="content-width stats-grid">
        {stats.map((stat) => (
          <div className="stat" key={stat.lines[0]}>
            <CountUp target={stat.target} />
            <span className="stat-label">
              {stat.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
