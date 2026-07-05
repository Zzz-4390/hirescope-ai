"use client";

import { useEffect } from "react";

export function HomeRevealManager() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".home-page > section");

    if (!("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("home-section-enter", "is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8%" },
    );

    sections.forEach((section) => {
      section.classList.add("home-section-enter");
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
