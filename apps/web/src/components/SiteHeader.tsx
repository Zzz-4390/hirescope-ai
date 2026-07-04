"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAccessToken } from "../lib/auth";
import { Logo } from "./Logo";

const navItems = [
  { label: "首页", href: "/", key: "home" },
  { label: "产品能力", href: "/capabilities", key: "capabilities" },
  { label: "使用流程" },
  { label: "报告示例" },
  { label: "角色入口" },
  { label: "帮助中心" },
] as const;

interface SiteHeaderProps {
  current?: "home" | "capabilities" | "login";
}

export function SiteHeader({ current = "home" }: SiteHeaderProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const updateAuthState = () => setIsLoggedIn(Boolean(getAccessToken()));
    updateAuthState();
    window.addEventListener("auth-change", updateAuthState);
    window.addEventListener("storage", updateAuthState);
    return () => {
      window.removeEventListener("auth-change", updateAuthState);
      window.removeEventListener("storage", updateAuthState);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="码途 AI 首页">
          <Logo />
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          {navItems.map((item) =>
            "href" in item ? (
              <Link key={item.label} className={current === item.key ? "active" : ""} href={item.href}>
                {item.label}
              </Link>
            ) : (
              <button key={item.label} type="button" aria-disabled="true" title="该页面暂未开放">
                {item.label}
              </button>
            ),
          )}
        </nav>
        <div className="header-actions">
          {isLoggedIn ? (
            <span className="logged-in-state"><i />已登录</span>
          ) : (
            <Link className={current === "login" ? "active" : ""} href="/login">登录</Link>
          )}
          <Link className="header-cta" href="/login">立即体验</Link>
        </div>
      </div>
    </header>
  );
}
