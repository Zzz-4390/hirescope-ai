import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders an inline mark and real brand text without a raster image", () => {
    const { container } = render(<Logo />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("码途 AI")).toBeInTheDocument();
    expect(screen.getByText("HireScope AI")).toBeInTheDocument();
  });

  it("draws exactly four staggered rising capsules with distinct visual roles", () => {
    const { container } = render(<Logo />);
    const capsules = Array.from(container.querySelectorAll(".logo-mark path"));

    expect(capsules).toHaveLength(4);
    expect(container.querySelectorAll(".logo-mark rect")).toHaveLength(0);
    expect(capsules.map((capsule) => capsule.getAttribute("data-role"))).toEqual([
      "upper",
      "main",
      "connector",
      "lower",
    ]);
    expect(capsules.every((capsule) => capsule.getAttribute("stroke-linecap") === "round")).toBe(true);

    const segments = capsules.map((capsule) =>
      (capsule.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
    );
    expect(segments.every(([startX, startY, endX, endY]) => endX > startX && endY < startY)).toBe(true);
    expect(new Set(segments.map(([startX, startY, endX, endY]) => Math.hypot(endX - startX, endY - startY).toFixed(2))).size).toBeGreaterThan(2);
  });
});
