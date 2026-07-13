"use client";

import { Check, ChevronRight, LogOut, Palette, RefreshCw, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type CurrentUser, logout } from "../lib/auth";
import styles from "./UserAccountMenu.module.css";

const ACCOUNT_MENU_CLOSE_DELAY_MS = 200;
const THEME_STORAGE_KEY = "hirescope-theme";

type AppTheme = "light" | "dark";

interface UserAccountMenuProps {
  user: CurrentUser;
  avatarUrl?: string | null;
  onLogoutError?: (message: string) => void;
}

export function UserAccountMenu({ user, avatarUrl = null, onLogoutError }: UserAccountMenuProps) {
  const router = useRouter();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountName = user.username || user.email || "用户";

  useEffect(() => {
    return () => {
      if (accountMenuCloseTimerRef.current !== null) clearTimeout(accountMenuCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        cancelAccountMenuClose();
        closeAccountMenu();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelAccountMenuClose();
        closeAccountMenu();
        accountMenuTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAccountMenuOpen]);

  function cancelAccountMenuClose() {
    if (accountMenuCloseTimerRef.current === null) return;
    clearTimeout(accountMenuCloseTimerRef.current);
    accountMenuCloseTimerRef.current = null;
  }

  function closeAccountMenu() {
    setIsAccountMenuOpen(false);
    setIsThemeMenuOpen(false);
  }

  function openAccountMenu() {
    cancelAccountMenuClose();
    setIsAccountMenuOpen(true);
  }

  function scheduleAccountMenuClose() {
    cancelAccountMenuClose();
    accountMenuCloseTimerRef.current = setTimeout(() => {
      closeAccountMenu();
      accountMenuCloseTimerRef.current = null;
    }, ACCOUNT_MENU_CLOSE_DELAY_MS);
  }

  function handleThemeSelect(theme: AppTheme) {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      window.dispatchEvent(new Event("auth-change"));
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setIsLoggingOut(false);
      onLogoutError?.(cause instanceof Error ? cause.message : "退出登录失败，请稍后重试");
    }
  }

  return (
    <div
      ref={accountMenuRef}
      className={styles.accountMenuArea}
      onMouseEnter={openAccountMenu}
      onMouseLeave={scheduleAccountMenuClose}
    >
      <button
        ref={accountMenuTriggerRef}
        className={styles.avatarButton}
        type="button"
        aria-label={`${accountName}的用户菜单`}
        aria-expanded={isAccountMenuOpen}
        aria-haspopup="menu"
        onClick={() => {
          cancelAccountMenuClose();
          setIsAccountMenuOpen((open) => !open);
        }}
      >
        {avatarUrl ? <img src={avatarUrl} alt="" /> : accountName.slice(0, 1).toUpperCase()}
      </button>
      <div
        className={`${styles.accountMenu} ${isAccountMenuOpen ? styles.accountMenuOpen : ""}`}
        role="menu"
        aria-label="用户菜单"
        aria-hidden={!isAccountMenuOpen}
      >
        <Link
          href="/app/profile"
          role="menuitem"
          onMouseEnter={() => setIsThemeMenuOpen(false)}
          onClick={closeAccountMenu}
        >
          <UserRound aria-hidden="true" /><span>个人中心</span><ChevronRight aria-hidden="true" />
        </Link>
        <div
          className={styles.themeMenuArea}
          onMouseEnter={() => setIsThemeMenuOpen(true)}
          onFocus={() => setIsThemeMenuOpen(true)}
        >
          <button
            className={styles.themeMenuTrigger}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isThemeMenuOpen}
          >
            <Palette aria-hidden="true" /><span>主题颜色</span><ChevronRight aria-hidden="true" />
          </button>
          <div
            className={`${styles.themeSubmenu} ${isThemeMenuOpen ? styles.themeSubmenuOpen : ""}`}
            role="menu"
            aria-label="主题颜色"
            aria-hidden={!isThemeMenuOpen}
          >
            <button className={styles.themeOptionLight} type="button" role="menuitem" onClick={() => handleThemeSelect("light")}>
              <span>浅色</span><Check className={styles.themeCheck} aria-hidden="true" />
            </button>
            <button className={styles.themeOptionDark} type="button" role="menuitem" onClick={() => handleThemeSelect("dark")}>
              <span>深色</span><Check className={styles.themeCheck} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={styles.accountMenuDivider} role="separator" />
        <button
          type="button"
          role="menuitem"
          disabled={isLoggingOut}
          onMouseEnter={() => setIsThemeMenuOpen(false)}
          onClick={() => { void handleLogout(); }}
        >
          {isLoggingOut ? <RefreshCw className={styles.spinning} aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          <span>{isLoggingOut ? "正在退出..." : "退出登录"}</span><ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
