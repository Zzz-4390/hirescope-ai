import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportRevealManager } from "./ReportRevealManager";

describe("ReportRevealManager", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main class="report-example-page"><section class="report-reveal-section"></section></main>';
  });

  it("reveals a report section once", () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const unobserve = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.stubGlobal("IntersectionObserver", vi.fn((next: IntersectionObserverCallback) => {
      callback = next;
      return { observe: vi.fn(), unobserve, disconnect: vi.fn() };
    }));

    render(<ReportRevealManager />);
    const section = document.querySelector<HTMLElement>(".report-reveal-section");
    expect(document.querySelector(".report-example-page")).toHaveAttribute("data-report-reveal-ready", "true");

    act(() => callback([{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(section).toHaveClass("is-visible");
    expect(unobserve).toHaveBeenCalledWith(section);
  });

  it("disables motion when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.stubGlobal("IntersectionObserver", vi.fn());
    render(<ReportRevealManager />);
    expect(document.querySelector(".report-reveal-section")).toHaveClass("is-visible");
    expect(IntersectionObserver).not.toHaveBeenCalled();
  });
});
