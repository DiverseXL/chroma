import Link from "next/link";
import { DEMO_RUN_ID } from "@/lib/demoRun";

/**
 * Landing entry point that opens the cached demo run instead of starting a
 * live (rate-limited, credit-consuming) run.
 */
export function DemoRun() {
  return (
    <section className="demo-run" aria-labelledby="demo-run-title">
      <div className="demo-run-inner">
        <span className="run-status-badge" data-status="PENDING">
          CACHED
        </span>
        <h2 id="demo-run-title" className="demo-run-title">
          Watch a demo run
        </h2>
        <p className="demo-run-lead">
          A finished multi-agent storyboard, replayed from cache — no API keys
          needed, no rate limits, no credits spent.
        </p>
        <Link
          className="button button-secondary"
          href={`/run?id=${encodeURIComponent(DEMO_RUN_ID)}`}
        >
          Watch a demo run
        </Link>
      </div>
    </section>
  );
}
