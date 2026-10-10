"use client";

import { useEffect } from "react";

export function RevealObserver() {
  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "-100px" },
    );

    for (const element of elements) {
      const bounds = element.getBoundingClientRect();
      const inInitialViewport =
        bounds.bottom > 100 && bounds.top < window.innerHeight - 100;
      element.dataset.visible = inInitialViewport ? "true" : "false";
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
