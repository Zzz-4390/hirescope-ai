import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRevealManager } from "./HomeRevealManager";

describe("HomeRevealManager", () => {
  let intersectionCallback: IntersectionObserverCallback;

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "0px";
        thresholds = [0.12];
      },
    );
  });

  it("reveals each home section when it enters the viewport", () => {
    const { container } = render(
      <main className="home-page">
        <HomeRevealManager />
        <section>第一屏</section>
        <section>第二屏</section>
      </main>,
    );
    const sections = container.querySelectorAll("section");

    expect(sections[0]).toHaveClass("home-section-enter");
    expect(sections[0]).not.toHaveClass("is-visible");

    act(() => {
      intersectionCallback(
        [{ isIntersecting: true, target: sections[0] } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(sections[0]).toHaveClass("is-visible");
  });
});
