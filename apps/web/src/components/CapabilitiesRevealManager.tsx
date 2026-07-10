"use client";

import { useEffect } from "react";

const SECTION_SELECTOR = ".cap-reveal-section";

export function CapabilitiesRevealManager() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".capabilities-page");
    if (!page) return;

    const sections = Array.from(page.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
    page.dataset.capRevealReady = "true";

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8%" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return null;
}
