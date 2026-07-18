import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NavigationLink,
  NavigationTransitionProvider,
  RouteTransitionBoundary,
} from "./NavigationTransition";

const navigation = vi.hoisted(() => ({
  pathname: "/capabilities",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("next/link", () => ({
  default: ({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    />
  ),
}));

function TestNavigation() {
  return (
    <NavigationTransitionProvider>
      <nav>
        <NavigationLink href="/reports">报告示例</NavigationLink>
        <NavigationLink href="/roles">角色入口</NavigationLink>
      </nav>
      <RouteTransitionBoundary><p>页面内容</p></RouteTransitionBoundary>
    </NavigationTransitionProvider>
  );
}

describe("NavigationTransition", () => {
  let animationFrames: FrameRequestCallback[];

  beforeEach(() => {
    navigation.pathname = "/capabilities";
    navigation.push.mockReset();
    window.history.replaceState({}, "", "/capabilities");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    animationFrames = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("starts routing immediately and serializes rapid navigation clicks", () => {
    const { rerender } = render(<TestNavigation />);
    const boundary = screen.getByText("页面内容").parentElement as HTMLElement;

    fireEvent.click(screen.getByRole("link", { name: "报告示例" }));
    expect(navigation.push).toHaveBeenCalledWith("/reports");
    expect(boundary).toHaveAttribute("data-route-transition-phase", "leaving");

    fireEvent.click(screen.getByRole("link", { name: "角色入口" }));
    expect(navigation.push).toHaveBeenCalledTimes(1);

    navigation.pathname = "/reports";
    window.history.replaceState({}, "", "/reports");
    rerender(<TestNavigation />);
    expect(boundary).toHaveAttribute("data-route-transition-phase", "entering");

    act(() => animationFrames.shift()?.(16));
    expect(boundary).toHaveAttribute("data-route-transition-phase", "idle");
  });

  it("does not animate route changes that were not initiated by a navigation link", () => {
    const { rerender } = render(<TestNavigation />);
    const boundary = screen.getByText("页面内容").parentElement as HTMLElement;

    navigation.pathname = "/reports";
    window.history.replaceState({}, "", "/reports");
    rerender(<TestNavigation />);

    expect(boundary).toHaveAttribute("data-route-transition-phase", "idle");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("bypasses custom routing when reduced motion is preferred", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    render(<TestNavigation />);

    fireEvent.click(screen.getByRole("link", { name: "报告示例" }));

    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByText("页面内容").parentElement).toHaveAttribute("data-route-transition-phase", "idle");
  });
});
