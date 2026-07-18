"use client";

import { CircleHelp, FileText, FolderKanban, Gauge, House, Menu, MessageSquareText, RefreshCw, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { type CurrentUser, getCurrentUser } from "../lib/auth";
import { listProjects, type Project } from "../lib/projects";
import { AppAvatarContext, AppProjectContext, AppUserContext } from "./AppUserContext";
import { DashboardToolbar } from "./dashboard/DashboardToolbar";
import { Logo } from "./Logo";
import { UserAccountMenu } from "./UserAccountMenu";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
}

const appNavItems = [
  { label: "首页", href: "/", icon: House },
  { label: "工作台", href: "/app", icon: Gauge },
  { label: "项目", href: "/app/projects", icon: FolderKanban },
  { label: "报告", href: "/app/reports", icon: FileText },
  { label: "面试", href: "/app/interviews", icon: MessageSquareText },
  { label: "帮助", href: "/help", icon: CircleHelp },
] as const;

function getActiveNavHref(path: string): string | null {
  if (path === "/") return "/";
  if (path === "/app") return "/app";
  if (path === "/app/interviews" || path.startsWith("/app/interviews/") || /^\/app\/projects\/[^/]+\/interviews(?:\/|$)/.test(path)) {
    return "/app/interviews";
  }
  if (path === "/app/projects" || path.startsWith("/app/projects/") || path.startsWith("/app/code-reviews/")) {
    return "/app/projects";
  }
  if (path === "/app/reports" || path.startsWith("/app/reports/")) return "/app/reports";
  if (path === "/help") return "/help";
  return null;
}

function getProjectIdFromPath(path: string): string {
  const match = path.match(/^\/app\/projects\/([^/]+)/);
  return match?.[1] === "new" ? "" : match?.[1] ?? "";
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState("");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [toolbarProjects, setToolbarProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const showDashboardToolbar = pathname === "/app";
  const isProfilePage = pathname === "/app/profile";
  const activeNavHref = getActiveNavHref(pathname);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((currentUser) => {
        if (!mounted) return;
        setUser(currentUser);
        setAvatarUrl(currentUser.avatarUrl);
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
    if (!showDashboardToolbar) return;
    let active = true;
    listProjects(1, 50)
      .then((response) => {
        if (!active) return;
        setToolbarProjects(response.items);
        setSelectedProjectId((current) => {
          const routeProjectId = getProjectIdFromPath(pathname);
          if (routeProjectId && response.items.some((project) => project.id === routeProjectId)) return routeProjectId;
          if (current && response.items.some((project) => project.id === current)) return current;
          return response.items[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (active) setToolbarProjects([]);
      });
    return () => { active = false; };
  }, [pathname, showDashboardToolbar]);

  function handleProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
    if (pathname !== "/app") router.push(`/app/projects/${projectId}`);
  }

  function handleAvatarUrl(nextAvatarUrl: string | null) {
    setAvatarUrl(nextAvatarUrl);
    setUser((currentUser) => currentUser ? { ...currentUser, avatarUrl: nextAvatarUrl } : currentUser);
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
      <AppAvatarContext.Provider value={{ avatarUrl, setAvatarUrl: handleAvatarUrl }}>
      <AppProjectContext.Provider value={{ selectedProjectId, selectProject: handleProjectSelect }}>
        <div className={`${styles.shell} app-authenticated-shell`}>
          <header className={`${styles.primaryHeader} app-primary-header`}>
            <div className={styles.primaryInner}>
              <Link className={styles.brand} href="/app" aria-label="码途 AI 工作台">
                <Logo />
              </Link>
              <nav className={`${styles.nav} ${isMobileNavOpen ? styles.navOpen : ""}`} aria-label="工作台主导航">
                {appNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === activeNavHref;
                  return (
                    <Link
                      key={item.href}
                      className={active ? styles.active : ""}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setIsMobileNavOpen(false)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className={styles.primaryActions}>
                <button
                  className={styles.mobileMenuButton}
                  type="button"
                  aria-label={isMobileNavOpen ? "关闭导航" : "打开导航"}
                  aria-expanded={isMobileNavOpen}
                  onClick={() => setIsMobileNavOpen((open) => !open)}
                >
                  {isMobileNavOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </button>
                {user ? (
                  <UserAccountMenu
                    user={user}
                    avatarUrl={avatarUrl}
                    onLogoutError={(message) => setError(message)}
                  />
                ) : null}
                <Link className={styles.uploadButton} href="/app/projects/new"><Upload aria-hidden="true" /><span>上传项目</span></Link>
              </div>
            </div>
          </header>
          {showDashboardToolbar ? (
            <DashboardToolbar projects={toolbarProjects} selectedId={selectedProjectId} onSelect={handleProjectSelect} />
          ) : null}
          <div className={`${styles.frame} ${isProfilePage ? styles.profileFrame : ""}`}>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <main className={styles.content}>{children}</main>
          </div>
        </div>
      </AppProjectContext.Provider>
      </AppAvatarContext.Provider>
    </AppUserContext.Provider>
  );
}
