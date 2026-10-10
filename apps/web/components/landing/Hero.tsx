import { BrandMark } from "./BrandMark";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <BrandMark
          className="hero-logo"
          size={72}
          gradientId="chroma-hero-gradient"
        />
        <h1 id="hero-title" className="hero-title">
          Turn a brief into a <span className="accent">finished image set</span>
        </h1>
        <p className="hero-lead">
          Chroma is an AI Creative Director. Describe what you want in plain
          English. A team of specialized agents plans the pipeline, generates
          images in parallel, scores every frame with a vision critic, and
          delivers a coherent set — showing the whole process live on a visual
          canvas.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="/run">
            Run a brief
          </a>
          <a className="button button-secondary" href="#how-it-works">
            See how it works
          </a>
        </div>
        <p className="hero-detail">&gt; 4 panels · 8 agents · 1 run</p>
      </div>
    </section>
  );
}
