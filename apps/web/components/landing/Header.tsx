"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_RUN_ID } from "@/lib/demoRun";
import { BrandMark } from "./BrandMark";

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 20);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <nav className="header-nav header-nav-left" aria-label="Main navigation">
        <a className="nav-link" href="#how-it-works">
          How it works
        </a>
        <a className="nav-link" href="#method">
          Method
        </a>
      </nav>

      <a className="brand" href="#top" aria-label="Chroma home">
        <BrandMark size={24} gradientId="chroma-brand-gradient" />
        <span>Chroma</span>
      </a>

      <nav className="header-nav header-nav-right" aria-label="Get started">
        <a
          className="icon-link header-github"
          href="https://github.com/DiverseXL/chroma"
          target="_blank"
          rel="noreferrer"
          aria-label="Chroma on GitHub"
          title="GitHub"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.2-1.5 6.2-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6S17.6 1.2 15 3a13.3 13.3 0 0 0-7 0C5.4 1.2 4.2 1.5 4.2 1.5a4.8 4.8 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.7V22" />
          </svg>
        </a>
        <Link
          className="button button-secondary header-demo"
          href={`/run?id=${encodeURIComponent(DEMO_RUN_ID)}`}
          aria-label="Watch a demo run"
        >
          <span className="header-demo-label">Watch a demo run</span>
          <span className="header-demo-label-short" aria-hidden="true">
            Watch demo
          </span>
        </Link>
        <a className="button button-primary header-launch" href="/run">
          Launch app
        </a>
      </nav>
    </header>
  );
}
