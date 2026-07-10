"use client";

import { FolderKanban, LogOut, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { type CurrentUser, getCurrentUser, logout } from "../lib/auth";
import { Logo } from "./Logo";

interface AppShellProps {
  children: ReactNode;
}

const appNavItems = [
  { label: "项目列表", href: "/app", icon: FolderKanban },
  { label: "上传项目", href: "/app/projects/new", icon: Plus },
] as const;

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((currentUser) => {
        if (!mounted) return;
        setUser(currentUser);
        setError("");
      })
      .catch(() => {
        if (!mounted) return;
        router.replace("/login");
      })
      .finally(() => {
        if (mounted) setIsChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogout() {
    setError("");
    try {
      await logout();
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退出登录失败，请稍后重试");
    }
  }

  if (isChecking) {
    return (
      <div className="app-loading">
        <RefreshCw aria-hidden="true" />
        <span>正在恢复登录状态...</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-brand" href="/app" aria-label="码途 AI 工作台">
          <Logo />
        </Link>
        <nav className="app-nav" aria-label="工作台导航">
          {appNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} className={active ? "active" : ""} href={item.href}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="app-main-frame">
        <header className="app-topbar">
          <div>
            <strong>{user?.displayName || user?.email || "已登录用户"}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="ghost-action" type="button" onClick={handleLogout}>
            <LogOut aria-hidden="true" />
            退出登录
          </button>
        </header>
        {error ? <p className="app-banner error" role="alert">{error}</p> : null}
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
