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
});
