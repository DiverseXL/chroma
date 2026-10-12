import type { Metadata } from "next";
import Link from "next/link";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { FooterCTA } from "@/components/landing/FooterCTA";
import { Header } from "@/components/landing/Header";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { DEMO_RUN_ID } from "@/lib/demoRun";

export const metadata: Metadata = {
  title: "How it works — Chroma",
  description:
    "How Chroma turns a plain-English brief into a coherent image set: story bible, parallel rendering, a vision-critic loop, and a live graph canvas.",
};

const steps = [
  {
    title: "Brief",
    copy: "Describe the set in plain English — a four-panel storyboard, a character sheet, a campaign. Vague is fine; the planner makes confident choices that fit the tone.",
  },
  {
    title: "Story bible",
    copy: "A planner agent turns the brief into a story bible: palette, characters, panel count, and the overall arc every later agent is held to.",
  },
  {
    title: "Panel plans",
    copy: "Scene plans are written one at a time, each seeing the panels before it — so the set progresses through the arc instead of repeating itself.",
  },
  {
    title: "Parallel render",
    copy: "Independent panels fan out and generate at the same time. A four-panel storyboard runs four image jobs concurrently.",
  },
  {
    title: "Critic loop",
    copy: "A vision model scores every frame against the bible. Below threshold triggers regeneration with the critic's notes in the prompt — bounded at two attempts.",
  },
  {
    title: "Compose",
    copy: "The set lands as a final sheet. Every prompt, score, and intermediate image stays inspectable on the canvas — nothing hides behind a chat box.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="landing-page">
      <Header />
      <main>
        <section className="how-hero">
          <div className="narrow-width">
            <span className="eyebrow">HOW IT WORKS</span>
            <h1 className="how-title">
              One brief in. A coherent image set out.
            </h1>
            <p className="how-lead">
              Chroma is an AI Creative Director. You describe what you want; a
              team of specialized agents plans the work as a graph, runs it in
              parallel, scores every frame with a vision critic, and shows the
              entire process live — no black box, no one-shot roulette.
            </p>
          </div>
        </section>

        <section className="section-space" aria-labelledby="steps-title">
          <div className="content-width">
            <header className="section-intro">
              <span className="eyebrow">DURING A RUN</span>
              <h2 className="section-heading" id="steps-title">
                What happens when you hit Run
              </h2>
              <p className="section-copy">
                Six stages, one graph. Each node&apos;s prompt, output, and
                score streams live to the canvas.
              </p>
            </header>
            <ol className="how-steps">
              {steps.map((step, index) => (
                <li className="feature-card" key={step.title}>
                  <span className="how-step-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="feature-title">{step.title}</h3>
                  <p className="feature-copy">{step.copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <FeatureGrid />

        <section className="narrow-width how-cta">
          <h2 className="section-heading">See it on a live canvas</h2>
          <p className="section-copy">
            Type a brief and watch the graph light up — or open the cached demo
            run to watch a finished one.
          </p>
          <div className="how-cta-actions">
            <Link className="button button-primary" href="/run">
              Run a brief
            </Link>
            <Link
              className="button button-secondary"
              href={`/run?id=${encodeURIComponent(DEMO_RUN_ID)}`}
            >
              Watch the demo
            </Link>
          </div>
        </section>
      </main>
      <FooterCTA />
      <RevealObserver />
    </div>
  );
}
