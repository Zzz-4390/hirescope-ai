import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CapabilitiesRevealManager } from "./CapabilitiesRevealManager";

describe("CapabilitiesRevealManager", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main class="capabilities-page">
        <section class="cap-reveal-section"></section>
      </main>
    `;
  });

  it("reveals each observed section once when it enters the viewport", () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const unobserve = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((nextCallback: IntersectionObserverCallback) => {
        callback = nextCallback;
        return { observe: vi.fn(), unobserve, disconnect: vi.fn() };
      }),
    );
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));

    render(<CapabilitiesRevealManager />);
    const section = document.querySelector<HTMLElement>(".cap-reveal-section");
    expect(section).not.toBeNull();

    expect(document.querySelector(".capabilities-page")).toHaveAttribute("data-cap-reveal-ready", "true");
    expect(section).not.toHaveClass("is-visible");

    act(() => {
      callback([{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(section).toHaveClass("is-visible");
    expect(unobserve).toHaveBeenCalledWith(section);
  });

  it("shows content immediately when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.stubGlobal("IntersectionObserver", vi.fn());

    render(<CapabilitiesRevealManager />);

    expect(document.querySelector(".cap-reveal-section")).toHaveClass("is-visible");
    expect(IntersectionObserver).not.toHaveBeenCalled();
  });
});
