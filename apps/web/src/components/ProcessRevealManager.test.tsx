import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessRevealManager } from "./ProcessRevealManager";

describe("ProcessRevealManager", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main class="process-page">
        <section class="process-reveal-section"></section>
        <section class="process-reveal-section"></section>
      </main>
    `;
  });

  it("reveals each section once when it enters the viewport", () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    const unobserve = vi.fn();

    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((nextCallback: IntersectionObserverCallback) => {
        callback = nextCallback;
        return { observe, unobserve, disconnect: vi.fn() };
      }),
    );

    render(<ProcessRevealManager />);
    const page = document.querySelector(".process-page");
    const sections = document.querySelectorAll<HTMLElement>(".process-reveal-section");

    expect(page).toHaveAttribute("data-process-reveal-ready", "true");
    expect(observe).toHaveBeenCalledTimes(2);
    expect(sections[0]).not.toHaveClass("is-visible");

    act(() => {
      callback(
        [{ isIntersecting: true, target: sections[0] } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(sections[0]).toHaveClass("is-visible");
    expect(unobserve).toHaveBeenCalledWith(sections[0]);
  });

  it("shows every section immediately for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.stubGlobal("IntersectionObserver", vi.fn());

    render(<ProcessRevealManager />);

    document.querySelectorAll(".process-reveal-section").forEach((section) => {
      expect(section).toHaveClass("is-visible");
    });
    expect(IntersectionObserver).not.toHaveBeenCalled();
  });
});
