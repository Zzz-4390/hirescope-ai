"use client";

import { KeyRound, LockKeyhole, Palette, Settings2, Upload, UserRound } from "lucide-react";
import { type ChangeEvent, type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import { useAppAvatar, useAppUser } from "../AppUserContext";
import styles from "./ProfileCenter.module.css";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfileSection = "profile" | "security" | "preferences";

const navigationItems = [
  { id: "profile", label: "个人资料", icon: UserRound },
  { id: "security", label: "账户安全", icon: LockKeyhole },
  { id: "preferences", label: "偏好设置", icon: Settings2 },
] as const;

function UserAvatar({ className, url, name }: { className: string; url: string | null; name: string }) {
  return (
    <span className={className} aria-label={`${name}的头像`} role="img">
      {url ? <img src={url} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ProfileCenter() {
  const user = useAppUser();
  const { avatarUrl, setAvatarFile } = useAppAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");

  const username = user?.username || user?.email?.split("@")[0] || "用户";
  const email = user?.email || "—";

  useEffect(() => {
    const syncSectionFromHash = () => {
      if (window.location.hash === "#preferences") setActiveSection("preferences");
    };
    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAvatarMessage("");
    setAvatarError("");
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      setAvatarError("请选择 JPG、PNG 或 WebP 格式的图片");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("头像文件不能超过 5MB");
      return;
    }
    setAvatarFile(file);
    setAvatarMessage("头像已更新，并同步到当前页面与顶部导航");
  }

  function handleRemoveAvatar() {
    setAvatarFile(null);
    setAvatarError("");
    setAvatarMessage("头像已移除");
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="个人中心导航">
          <div className={styles.identity}>
            <UserAvatar className={styles.sidebarAvatar} url={avatarUrl} name={username} />
            <strong>{username}</strong>
            <span>{email}</span>
          </div>
          <nav>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  className={active ? styles.activeNavItem : ""}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className={styles.main}>
          {activeSection === "profile" ? (
            <ProfileDetails
              username={username}
              email={email}
              avatarUrl={avatarUrl}
              avatarMessage={avatarMessage}
              avatarError={avatarError}
              fileInputRef={fileInputRef}
              onAvatarChange={handleAvatarChange}
              onRemoveAvatar={handleRemoveAvatar}
            />
          ) : activeSection === "security" ? (
            <SecuritySettings />
          ) : (
            <PreferenceSettings />
          )}
        </main>
      </div>
    </div>
  );
}

interface ProfileDetailsProps {
  username: string;
  email: string;
  avatarUrl: string | null;
  avatarMessage: string;
  avatarError: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
}

function ProfileDetails({ username, email, avatarUrl, avatarMessage, avatarError, fileInputRef, onAvatarChange, onRemoveAvatar }: ProfileDetailsProps) {
  return (
    <>
      <header className={styles.heading}>
        <h1>个人资料</h1>
        <p>管理您的个人信息与账户设置</p>
      </header>
      <section className={styles.card} aria-labelledby="avatar-title">
        <div className={styles.sectionTitle}>
          <h2 id="avatar-title">头像</h2>
        </div>
        <div className={styles.avatarEditor}>
          <UserAvatar className={styles.profileAvatar} url={avatarUrl} name={username} />
          <div className={styles.avatarActions}>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              aria-label="选择头像文件"
              accept="image/jpeg,image/png,image/webp"
              onChange={onAvatarChange}
            />
            <button className={styles.uploadAvatarButton} type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" />
              上传新头像
            </button>
            <button className={styles.removeAvatarButton} type="button" disabled={!avatarUrl} onClick={onRemoveAvatar}>
              移除头像
            </button>
            <span className={styles.formatHint}>支持 JPG、PNG、WebP，最大 5MB</span>
            {avatarMessage ? <span className={styles.successMessage} role="status">{avatarMessage}</span> : null}
            {avatarError ? <span className={styles.errorMessage} role="alert">{avatarError}</span> : null}
          </div>
        </div>

        <div className={`${styles.sectionTitle} ${styles.basicTitle}`}>
          <h2>基本信息</h2>
        </div>
        <div className={styles.fields}>
          <div>
            <span>用户名</span>
            <div className={styles.readonlyField}>
              <strong>{username}</strong>
              <em><LockKeyhole aria-hidden="true" />只读</em>
            </div>
            <small>用于登录，暂不支持修改</small>
          </div>
          <div>
            <span>邮箱</span>
            <div className={styles.readonlyField}>
              <strong>{email}</strong>
              <button type="button" aria-label="更换邮箱" disabled title="当前版本尚未提供安全邮箱更换接口">更换邮箱</button>
            </div>
            <small>更换邮箱需要完成身份验证</small>
          </div>
        </div>
      </section>
    </>
  );
}

function SecuritySettings() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <>
      <header className={styles.heading}>
        <h1>账户安全</h1>
        <p>通过验证当前密码保护您的账户</p>
      </header>
      <section className={styles.card} aria-labelledby="password-title">
        <div className={styles.sectionTitle}>
          <h2 id="password-title">修改密码</h2>
        </div>
        <form className={styles.passwordForm} onSubmit={handleSubmit}>
          <label><span>当前密码</span><input type="password" autoComplete="current-password" /></label>
          <label><span>新密码</span><input type="password" autoComplete="new-password" /></label>
          <label><span>确认密码</span><input type="password" autoComplete="new-password" /></label>
          <p><KeyRound aria-hidden="true" />当前后端尚未提供安全的修改密码接口，因此不会提交或伪造修改结果。</p>
          <button type="submit" disabled>修改密码暂不可用</button>
        </form>
      </section>
    </>
  );
}

function PreferenceSettings() {
  return (
    <>
      <header className={styles.heading} id="preferences">
        <h1>偏好设置</h1>
        <p>查看当前界面外观设置</p>
      </header>
      <section className={styles.card} aria-labelledby="appearance-title">
        <div className={styles.sectionTitle}>
          <h2 id="appearance-title">界面外观</h2>
        </div>
        <div className={styles.preferenceStatus}>
          <Palette aria-hidden="true" />
          <div>
            <strong>浅色 / 深色主题</strong>
            <p>可从右上角头像菜单切换界面主题；选择会自动保存，并在刷新后恢复。</p>
          </div>
        </div>
      </section>
    </>
  );
}
