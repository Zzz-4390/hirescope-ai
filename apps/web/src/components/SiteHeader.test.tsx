import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  beforeEach(() => localStorage.clear());

  it("links login and primary action to /login", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "立即体验" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("links product capabilities to its page and marks it active", () => {
    render(<SiteHeader current="capabilities" />);

    expect(screen.getByRole("link", { name: "产品能力" })).toHaveAttribute(
      "href",
      "/capabilities",
    );
    expect(screen.getByRole("link", { name: "产品能力" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "首页" })).not.toHaveClass("active");
  });

  it("shows logged-in state when an access token exists", () => {
    localStorage.setItem("hirescope.accessToken", "token-123");

    render(<SiteHeader />);

    expect(screen.getByText("已登录")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
  });

  it("only marks login active on the login route", () => {
    render(<SiteHeader current="login" />);

    expect(screen.getByRole("link", { name: "首页" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "登录" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "立即体验" })).not.toHaveClass("active");
  });
});
