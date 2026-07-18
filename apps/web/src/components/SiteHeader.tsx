"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { type CurrentUser, getAccessToken, getCurrentUser } from "../lib/auth";
import { Logo } from "./Logo";
import { NavigationLink } from "./NavigationTransition";
import { UserAccountMenu } from "./UserAccountMenu";

const navItems = [
  { label: "首页", href: "/", key: "home" },
  { label: "产品能力", href: "/capabilities", key: "capabilities" },
  { label: "使用流程", href: "/process", key: "process" },
  { label: "报告示例", href: "/reports", key: "reports" },
  { label: "角色入口", href: "/roles", key: "roles" },
  { label: "帮助中心", href: "/help", key: "help" },
] as const;

interface SiteHeaderProps {
  current?: "home" | "capabilities" | "process" | "reports" | "roles" | "help" | "login";
}

export function SiteHeader({ current = "home" }: SiteHeaderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateAuthState = () => {
      getCurrentUser()
        .then((currentUser) => {
          if (mounted) setUser(currentUser);
        })
        .catch(() => {
          if (mounted) setUser(null);
        });
    };

    const updateAuthState = () => {
      if (getAccessToken()) validateAuthState();
      else setUser(null);
    };

    if (getAccessToken()) validateAuthState();
    window.addEventListener("auth-change", updateAuthState);
    window.addEventListener("storage", updateAuthState);
    return () => {
      mounted = false;
      window.removeEventListener("auth-change", updateAuthState);
      window.removeEventListener("storage", updateAuthState);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="header-inner">
        <NavigationLink className="brand" href="/" aria-label="码途 AI 首页">
          <Logo />
        </NavigationLink>
        <nav className="desktop-nav" aria-label="主导航">
          {navItems.map((item) => (
            <NavigationLink key={item.label} className={current === item.key ? "active" : ""} href={item.href}>
              {item.label}
            </NavigationLink>
          ))}
        </nav>
        <div className="header-actions">
          {user ? (
            <UserAccountMenu user={user} avatarUrl={user.avatarUrl} />
          ) : (
            <NavigationLink className={current === "login" ? "active" : ""} href="/login">登录</NavigationLink>
          )}
          <NavigationLink className="header-cta" href={user ? "/app" : "/login"}>
            {user ? "进入工作台" : "立即体验"}
          </NavigationLink>
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-expanded={isMobileNavOpen}
            aria-label={isMobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
            onClick={() => setIsMobileNavOpen((value) => !value)}
          >
            {isMobileNavOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {isMobileNavOpen ? (
        <nav className="mobile-nav-panel" aria-label="移动端导航">
          {navItems.map((item) => (
            <NavigationLink
              key={item.label}
              className={current === item.key ? "active" : ""}
              href={item.href}
              onClick={() => setIsMobileNavOpen(false)}
            >
              {item.label}
            </NavigationLink>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
