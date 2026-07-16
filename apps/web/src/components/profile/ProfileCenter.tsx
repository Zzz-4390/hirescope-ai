"use client";

import { KeyRound, LockKeyhole, Palette, Settings2, Upload, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import { changePassword, uploadAvatar } from "../../lib/auth";
import { useAppAvatar, useAppUser } from "../AppUserContext";
import styles from "./ProfileCenter.module.css";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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
  const { avatarUrl, setAvatarUrl } = useAppAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAvatarMessage("");
    setAvatarError("");
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_AVATAR_TYPES.has(file.type) || !ACCEPTED_AVATAR_EXTENSIONS.has(extension)) {
      setSelectedAvatar(null);
      setAvatarPreviewUrl(null);
      setAvatarError("请选择 JPG、PNG 或 WebP 格式的图片");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setSelectedAvatar(null);
      setAvatarPreviewUrl(null);
      setAvatarError("头像文件不能超过 5MB");
      return;
    }
    setSelectedAvatar(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  }

  async function handleAvatarUpload() {
    if (!selectedAvatar || isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    setAvatarMessage("");
    setAvatarError("");
    try {
      const updatedUser = await uploadAvatar(selectedAvatar);
      setAvatarUrl(updatedUser.avatarUrl);
      setSelectedAvatar(null);
      setAvatarPreviewUrl(null);
      setAvatarMessage("头像上传成功，已同步到个人中心与顶部导航");
    } catch (cause) {
      setAvatarError(cause instanceof Error ? cause.message : "头像上传失败，请稍后重试");
    } finally {
      setIsUploadingAvatar(false);
    }
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
              avatarUrl={avatarPreviewUrl ?? avatarUrl}
              avatarMessage={avatarMessage}
              avatarError={avatarError}
              selectedAvatarName={selectedAvatar?.name ?? ""}
              isUploadingAvatar={isUploadingAvatar}
              fileInputRef={fileInputRef}
              onAvatarChange={handleAvatarChange}
              onAvatarUpload={handleAvatarUpload}
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
  selectedAvatarName: string;
  isUploadingAvatar: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarUpload: () => Promise<void>;
}

function ProfileDetails({
  username,
  email,
  avatarUrl,
  avatarMessage,
  avatarError,
  selectedAvatarName,
  isUploadingAvatar,
  fileInputRef,
  onAvatarChange,
  onAvatarUpload,
}: ProfileDetailsProps) {
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
            <button className={styles.selectAvatarButton} type="button" disabled={isUploadingAvatar} onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" />
              {selectedAvatarName ? "重新选择" : "选择新头像"}
            </button>
            <button
              className={styles.uploadAvatarButton}
              type="button"
              disabled={!selectedAvatarName || isUploadingAvatar}
              onClick={() => { void onAvatarUpload(); }}
            >
              {isUploadingAvatar ? "上传中..." : "上传头像"}
            </button>
            {selectedAvatarName ? <span className={styles.selectedFileName}>已选择：{selectedAvatarName}</span> : null}
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
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    if (newPassword.length < 6 || newPassword.length > 128) {
      setError("新密码长度必须为 6 到 128 个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === newPassword) {
      setError("新密码不能与当前密码相同");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      sessionStorage.setItem("hirescope.loginNotice", "密码修改成功，请重新登录");
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码修改失败，请稍后重试");
      setIsSubmitting(false);
    }
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
          <label><span>当前密码</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={6} maxLength={128} /></label>
          <label><span>新密码</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={6} maxLength={128} /></label>
          <label><span>确认密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} maxLength={128} /></label>
          <p><KeyRound aria-hidden="true" />修改成功后会撤销全部登录会话，并要求重新登录。</p>
          {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? "正在修改..." : "修改密码"}</button>
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
