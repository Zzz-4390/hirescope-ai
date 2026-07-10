import { fireEvent, render, screen } from "@testing-library/react";
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

  it("links every top-level navigation item to its route", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "产品能力" })).toHaveAttribute("href", "/capabilities");
    expect(screen.getByRole("link", { name: "使用流程" })).toHaveAttribute("href", "/process");
    expect(screen.getByRole("link", { name: "报告示例" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: "角色入口" })).toHaveAttribute("href", "/roles");
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute("href", "/help");
    expect(screen.queryByRole("button", { name: /使用流程|报告示例|角色入口|帮助中心/ })).not.toBeInTheDocument();
  });

  it("opens the mobile navigation menu with the same routes", () => {
    render(<SiteHeader />);

    fireEvent.click(screen.getByRole("button", { name: "打开导航菜单" }));

    expect(screen.getByRole("navigation", { name: "移动端导航" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "使用流程" }).at(-1)).toHaveAttribute("href", "/process");
    expect(screen.getAllByRole("link", { name: "报告示例" }).at(-1)).toHaveAttribute("href", "/reports");
    expect(screen.getAllByRole("link", { name: "角色入口" }).at(-1)).toHaveAttribute("href", "/roles");
    expect(screen.getAllByRole("link", { name: "帮助中心" }).at(-1)).toHaveAttribute("href", "/help");
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
