"use client";

import { ChevronDown, CircleHelp, FileText, Folder, FolderKanban, Gauge, LogOut, Menu, MessageSquareText, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { type CurrentUser, getCurrentUser, logout } from "../lib/auth";
import { listProjects, type Project } from "../lib/projects";
import { Logo } from "./Logo";
import styles from "./AppShell.module.css";
import { AppUserContext } from "./AppUserContext";

interface AppShellProps {
  children: ReactNode;
}

const appNavItems = [
  { label: "工作台", href: "/app", icon: Gauge },
  { label: "项目", href: "/app/projects", icon: FolderKanban },
  { label: "报告", href: "/app/reports", icon: FileText },
  { label: "面试", href: "/app/interviews", icon: MessageSquareText },
  { label: "帮助", href: "/help", icon: CircleHelp },
] as const;

function getActiveNavHref(path: string): string | null {
  if (path === "/app") return "/app";
  if (path === "/app/reports" || path.endsWith("/report")) return "/app/reports";
  if (path === "/app/interviews" || path.startsWith("/app/interviews/") || path.includes("/interviews")) return "/app/interviews";
  if (path === "/app/projects" || path.startsWith("/app/projects/") || path.startsWith("/app/code-reviews/")) return "/app/projects";
  if (path === "/help") return "/help";
  return null;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState("");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [toolbarProjects, setToolbarProjects] = useState<Project[]>([]);
  const showSectionToolbar = ["/app/projects", "/app/reports", "/app/interviews"].includes(pathname);
  const activeNavHref = getActiveNavHref(pathname);

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

  useEffect(() => {
    if (!showSectionToolbar) return;
    let active = true;
    listProjects(1, 50)
      .then((response) => { if (active) setToolbarProjects(response.items); })
      .catch(() => { if (active) setToolbarProjects([]); });
    return () => { active = false; };
  }, [showSectionToolbar]);

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
    <AppUserContext.Provider value={user}>
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/app" aria-label="码途 AI 工作台">
          <Logo />
        </Link>
        <button
          className={styles.mobileMenuButton}
          type="button"
          aria-label={isMobileNavOpen ? "关闭导航" : "打开导航"}
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((open) => !open)}
        >
          {isMobileNavOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav className={`${styles.nav} ${isMobileNavOpen ? styles.navOpen : ""}`} aria-label="工作台导航">
          {appNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === activeNavHref;
            return (
              <Link key={item.href} className={active ? styles.active : ""} href={item.href} onClick={() => setIsMobileNavOpen(false)}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.account}>
          {isAccountMenuOpen ? (
            <div className={styles.accountMenu} role="menu">
              <button type="button" role="menuitem" onClick={handleLogout}><LogOut aria-hidden="true" />退出登录</button>
            </div>
          ) : null}
          <button
            className={styles.accountTrigger}
            type="button"
            aria-expanded={isAccountMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsAccountMenuOpen((open) => !open)}
          >
            <span className={styles.avatar} aria-hidden="true">{(user?.displayName || user?.email || "用").slice(0, 1).toUpperCase()}</span>
            <strong>{user?.displayName || user?.email || "已登录用户"}</strong>
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className={styles.frame}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {showSectionToolbar ? (
          <header className={styles.topbar}>
            <label className={styles.projectSelector}>
              <Folder aria-hidden="true" />
              <select aria-label="项目选择器" defaultValue="" onChange={(event) => { if (event.target.value) router.push(`/app/projects/${event.target.value}`); }}>
                <option value="">{toolbarProjects.length > 0 ? "选择项目" : "暂无项目"}</option>
                {toolbarProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <div className={styles.topbarActions}>
              <Link href="/help"><CircleHelp aria-hidden="true" /><span>帮助</span></Link>
              <span className={styles.topbarAvatar} title={user?.displayName || user?.email || "已登录用户"}>
                {(user?.displayName || user?.email || "用").slice(0, 1).toUpperCase()}
              </span>
            </div>
          </header>
        ) : null}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
    </AppUserContext.Provider>
  );
}
