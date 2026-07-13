import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./SiteHeader";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh }),
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    localStorage.clear();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("links login and signed-out primary action to /login", () => {
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

  it("shows the shared account menu and workbench action after the access token is validated", async () => {
    localStorage.setItem("hirescope.accessToken", "token-123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1", username: "candidate_01", email: "candidate@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<SiteHeader />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "candidate_01的用户菜单" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "进入工作台" })).toHaveAttribute(
        "href",
        "/app",
      );
    });

    const avatar = screen.getByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    expect(screen.getByRole("menuitem", { name: "个人中心" })).toHaveAttribute("href", "/app/profile");
    expect(screen.getByRole("menuitem", { name: "主题颜色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("refreshes auth state and returns home after logout", async () => {
    localStorage.setItem("hirescope.accessToken", "token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "user-1", username: "candidate_01", email: "candidate@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    render(<SiteHeader />);

    const avatar = await screen.findByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(localStorage.getItem("hirescope.accessToken")).toBeNull();
      expect(navigation.replace).toHaveBeenCalledWith("/");
      expect(navigation.refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("link", { name: "登录" })).toBeInTheDocument();
    });
  });

  it("only marks login active on the login route", () => {
    render(<SiteHeader current="login" />);

    expect(screen.getByRole("link", { name: "首页" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "登录" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "立即体验" })).not.toHaveClass("active");
  });
});
