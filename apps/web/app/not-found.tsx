import Link from "next/link";

export default function NotFound() {
  return (
    <div className="landing-page">
      <main className="narrow-width not-found">
        <span className="eyebrow">404</span>
        <h1 className="not-found-title">This page drifted off the grid.</h1>
        <p className="not-found-copy">
          The link may be broken, or the page may have moved. Head back home to
          pick up the trail.
        </p>
        <div className="not-found-actions">
          <Link className="button button-primary" href="/">
            Back home
          </Link>
          <Link className="button button-secondary" href="/run">
            Open Chroma
          </Link>
        </div>
      </main>
    </div>
  );
}
