import { DemoPreview } from "@/components/landing/DemoPreview";
import { FAQ } from "@/components/landing/FAQ";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { FooterCTA } from "@/components/landing/FooterCTA";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { Stats } from "@/components/landing/Stats";
import { Ticker } from "@/components/landing/Ticker";

export default function HomePage() {
  return (
    <div id="top" className="landing-page">
      <Header />
      <main>
        <Hero />
        <Ticker />
        <DemoPreview />
        <FeatureGrid />
        <Stats />
        <FAQ />
        <FooterCTA />
      </main>
      <RevealObserver />
    </div>
  );
}
