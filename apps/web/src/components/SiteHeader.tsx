"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAccessToken } from "../lib/auth";
import { Logo } from "./Logo";

const navItems = ["首页", "产品能力", "使用流程", "报告示例", "角色入口", "帮助中心"];

interface SiteHeaderProps {
  current?: "home" | "login";
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
          {navItems.map((item, index) =>
            index === 0 ? (
              <Link key={item} className={current === "home" ? "active" : ""} href="/">
                {item}
              </Link>
            ) : (
              <button key={item} type="button" aria-disabled="true" title="该页面暂未开放">
                {item}
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
