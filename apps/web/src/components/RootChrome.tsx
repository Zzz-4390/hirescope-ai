"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RouteTransitionBoundary } from "./NavigationTransition";
import { SiteHeader } from "./SiteHeader";

type PublicNavigationKey = "home" | "capabilities" | "process" | "reports" | "roles" | "help" | "login";

function getPublicNavigationKey(pathname: string): PublicNavigationKey {
  if (pathname === "/capabilities") return "capabilities";
  if (pathname === "/process") return "process";
  if (pathname === "/reports") return "reports";
  if (pathname === "/roles") return "roles";
  if (pathname === "/help") return "help";
  if (pathname === "/login" || pathname === "/register") return "login";
  return "home";
}

export function RootChrome({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  if (pathname.startsWith("/app")) return children;

  return (
    <>
      <SiteHeader current={getPublicNavigationKey(pathname)} />
      <RouteTransitionBoundary>{children}</RouteTransitionBoundary>
    </>
  );
}
