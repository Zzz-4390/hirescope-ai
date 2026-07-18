import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { useAppAvatar } from "./AppUserContext";

const navigation = vi.hoisted(() => ({
  pathname: "/app/projects",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));
const projectsApi = vi.hoisted(() => ({ listProjects: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: navigation.refresh }),
}));

vi.mock("../lib/auth", () => ({
  getCurrentUser: auth.getCurrentUser,
  logout: auth.logout,
}));

vi.mock("../lib/projects", () => ({
  listProjects: projectsApi.listProjects,
}));

const project = {
  id: "project-1",
  name: "校园失物招领系统",
  description: null,
  originalFileName: "project.zip",
  fileSize: 1024,
  status: "COMPLETED",
  failure: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.dataset.theme = "light";
    navigation.pathname = "/app/projects";
    navigation.push.mockReset();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    auth.getCurrentUser.mockResolvedValue({
      id: "user-1",
      username: "candidate_01",
      email: "candidate@example.com",
      displayName: "测试用户",
      avatarUrl: null,
    });
    auth.logout.mockReset();
    auth.logout.mockResolvedValue(undefined);
    projectsApi.listProjects.mockReset();
    projectsApi.listProjects.mockResolvedValue({
      items: [project],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
  });

  it("renders the authenticated routes in a top primary navigation", async () => {
    render(<AppShell><p>项目页面</p></AppShell>);

    const navigationRegion = await screen.findByRole("navigation", { name: "工作台主导航" });
    expect(navigationRegion).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "工作台" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "项目" })).toHaveAttribute("href", "/app/projects");
    expect(screen.getByRole("link", { name: "报告" })).toHaveAttribute("href", "/app/reports");
    expect(screen.getByRole("link", { name: "面试" })).toHaveAttribute("href", "/app/interviews");
    expect(screen.getByRole("link", { name: "帮助" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "项目" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "工作台" })).not.toHaveAttribute("aria-current");
  });

  it.each([
    ["/app", "/app"],
    ["/app/projects", "/app/projects"],
    ["/app/projects/project-1", "/app/projects"],
    ["/app/projects/project-1/review", "/app/projects"],
    ["/app/code-reviews/review-1", "/app/projects"],
    ["/app/reports", "/app/reports"],
    ["/app/reports/report-1", "/app/reports"],
    ["/app/interviews", "/app/interviews"],
    ["/app/interviews/interview-1", "/app/interviews"],
    ["/app/interviews/interview-1/report", "/app/interviews"],
    ["/app/projects/project-1/interviews", "/app/interviews"],
  ])("highlights %s with the matching navigation item", async (pathname, activeHref) => {
    navigation.pathname = pathname;
    render(<AppShell><p>页面内容</p></AppShell>);

    const navigationRegion = await screen.findByRole("navigation", { name: "工作台主导航" });
    const links = Array.from(navigationRegion.querySelectorAll("a"));
    const activeLinks = links.filter((link) => link.getAttribute("aria-current") === "page");

    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveAttribute("href", activeHref);
  });

  it("updates the active navigation item when pathname changes", async () => {
    navigation.pathname = "/app";
    const { rerender } = render(<AppShell><p>工作台页面</p></AppShell>);
    const navigationRegion = await screen.findByRole("navigation", { name: "工作台主导航" });

    expect(navigationRegion.querySelector('a[href="/app"]')).toHaveAttribute("aria-current", "page");

    navigation.pathname = "/app/reports/report-1";
    rerender(<AppShell><p>报告页面</p></AppShell>);

    expect(navigationRegion.querySelector('a[href="/app"]')).not.toHaveAttribute("aria-current");
    expect(navigationRegion.querySelector('a[href="/app/reports"]')).toHaveAttribute("aria-current", "page");
  });

  it("does not treat an unrelated app route as the dashboard", async () => {
    navigation.pathname = "/app/profile";
    render(<AppShell><p>个人中心</p></AppShell>);

    const navigationRegion = await screen.findByRole("navigation", { name: "工作台主导航" });
    expect(navigationRegion.querySelector('[aria-current="page"]')).not.toBeInTheDocument();
  });

  it("highlights home only on the home route", async () => {
    navigation.pathname = "/";
    render(<AppShell><p>首页</p></AppShell>);

    const homeLink = await screen.findByRole("link", { name: "首页" });
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "工作台" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the project context, avatar menu, and upload action in the two fixed header layers", async () => {
    navigation.pathname = "/app";
    render(<AppShell><p>项目页面</p></AppShell>);

    expect(await screen.findByText("当前项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目选择器：校园失物招领系统" })).toBeInTheDocument();
    expect(screen.getByText("分析完成")).toBeInTheDocument();

    const uploadLink = screen.getByRole("link", { name: "上传项目" });
    expect(uploadLink).toHaveAttribute("href", "/app/projects/new");
    expect(uploadLink.parentElement?.lastElementChild).toBe(uploadLink);

    const avatar = screen.getByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    expect(screen.getByRole("menuitem", { name: "个人中心" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "主题颜色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("synchronizes an updated avatar URL into the top account menu", async () => {
    auth.getCurrentUser.mockResolvedValue({
      id: "user-1",
      username: "candidate_01",
      email: "candidate@example.com",
      displayName: null,
      avatarUrl: "https://signed.example/old.png",
    });

    function AvatarUpdater() {
      const { setAvatarUrl } = useAppAvatar();
      return <button type="button" onClick={() => setAvatarUrl("https://signed.example/new.png")}>同步头像</button>;
    }

    render(<AppShell><AvatarUpdater /></AppShell>);
    const avatar = await screen.findByRole("button", { name: "candidate_01的用户菜单" });
    expect(avatar.querySelector("img")).toHaveAttribute("src", "https://signed.example/old.png");

    fireEvent.click(screen.getByRole("button", { name: "同步头像" }));
    expect(avatar.querySelector("img")).toHaveAttribute("src", "https://signed.example/new.png");
  });

  it("delays hover close and cancels it when the pointer returns", async () => {
    render(<AppShell><p>项目页面</p></AppShell>);

    const avatar = await screen.findByRole("button", { name: "candidate_01的用户菜单" });
    const accountMenuArea = avatar.parentElement as HTMLElement;
    fireEvent.mouseEnter(accountMenuArea);
    expect(screen.getByRole("menu", { name: "用户菜单" })).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      fireEvent.mouseLeave(accountMenuArea);
      act(() => vi.advanceTimersByTime(199));
      expect(screen.getByRole("menu", { name: "用户菜单" })).toBeInTheDocument();

      fireEvent.mouseEnter(accountMenuArea);
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("menu", { name: "用户菜单" })).toBeInTheDocument();

      fireEvent.mouseLeave(accountMenuArea);
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByRole("menu", { name: "用户菜单" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the theme submenu and persists the selected application theme", async () => {
    render(<AppShell><p>项目页面</p></AppShell>);

    const avatar = await screen.findByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);

    const themeTrigger = screen.getByRole("menuitem", { name: "主题颜色" });
    fireEvent.mouseEnter(themeTrigger.parentElement as HTMLElement);
    expect(screen.getByRole("menu", { name: "主题颜色" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "深色" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("hirescope-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("menuitem", { name: "浅色" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("hirescope-theme")).toBe("light");
  });

  it("keeps outside pointer and Escape dismissal", async () => {
    render(<AppShell><p>项目页面</p></AppShell>);

    const avatar = await screen.findByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "用户菜单" })).not.toBeInTheDocument();

    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "用户菜单" })).not.toBeInTheDocument();
    expect(avatar).toHaveFocus();
  });

  it("does not render or request dashboard project context on other routes", async () => {
    navigation.pathname = "/app/projects";
    render(<AppShell><p>项目页面</p></AppShell>);

    await screen.findByRole("navigation", { name: "工作台主导航" });
    expect(screen.queryByText("当前项目")).not.toBeInTheDocument();
    expect(projectsApi.listProjects).not.toHaveBeenCalled();
  });

  it("preserves project routing and logout behavior", async () => {
    navigation.pathname = "/app";
    render(<AppShell><p>项目页面</p></AppShell>);

    const selector = await screen.findByRole("button", { name: "项目选择器：校园失物招领系统" });
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole("option", { name: /校园失物招领系统/ }));
    expect(navigation.push).not.toHaveBeenCalled();

    const avatar = screen.getByRole("button", { name: "candidate_01的用户菜单" });
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(auth.logout).toHaveBeenCalledTimes(1);
      expect(navigation.replace).toHaveBeenCalledWith("/login");
      expect(navigation.refresh).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem("hirescope.loginNotice")).toBe("已退出登录");
  });

  it("collapses and closes the primary navigation on mobile", async () => {
    render(<AppShell><p>项目页面</p></AppShell>);

    const menuButton = await screen.findByRole("button", { name: "打开导航" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "关闭导航" })).toHaveAttribute("aria-expanded", "true");

    const reportLink = screen.getByRole("link", { name: "报告" });
    reportLink.addEventListener("click", (event) => event.preventDefault(), { capture: true });
    fireEvent.click(reportLink);
    expect(screen.getByRole("button", { name: "打开导航" })).toHaveAttribute("aria-expanded", "false");
  });
});
