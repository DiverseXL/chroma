"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  target: number;
}

export function CountUp({ target }: CountUpProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setValue(target);
          return;
        }

        const startedAt = performance.now();
        const duration = 1600;
        const update = (now: number) => {
          const progress = Math.min((now - startedAt) / duration, 1);
          setValue(Math.round(target * progress));
          if (progress < 1) frame = requestAnimationFrame(update);
        };
        frame = requestAnimationFrame(update);
      },
      { rootMargin: "-100px" },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <span className="stat-number" ref={elementRef} aria-label={String(target)}>
      {new Intl.NumberFormat("en-US").format(value)}
    </span>
  );
}
