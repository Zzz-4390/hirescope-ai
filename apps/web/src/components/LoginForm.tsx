"use client";

import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { login, saveAccessToken } from "../lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(() => getRememberedIdentifier());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberAccount, setRememberAccount] = useState(() => Boolean(getRememberedIdentifier()));
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("loading");
    try {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const result = await login(normalizedIdentifier, password);
      saveAccessToken(result.accessToken);
      if (rememberAccount) {
        localStorage.setItem("hirescope.rememberedIdentifier", normalizedIdentifier);
        localStorage.removeItem("hirescope.rememberedEmail");
      } else {
        localStorage.removeItem("hirescope.rememberedIdentifier");
        localStorage.removeItem("hirescope.rememberedEmail");
      }
      setStatus("success");
      router.push("/app");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试");
      setStatus("idle");
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h2>登录码途 AI</h2>
      <label className="field">
        <span className="sr-only">用户名或邮箱</span>
        <UserRound aria-hidden="true" />
        <input
          type="text"
          autoComplete="username"
          placeholder="用户名或邮箱"
          aria-label="用户名或邮箱"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="sr-only">密码</span>
        <LockKeyhole aria-hidden="true" />
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="密码"
          aria-label="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={showPassword ? "隐藏密码" : "显示密码"}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </button>
      </label>
      <div className="form-options">
        <label className="remember-option">
          <input
            type="checkbox"
            checked={rememberAccount}
            onChange={(event) => setRememberAccount(event.target.checked)}
          />
          <span>记住我的账号</span>
        </label>
        <span className="muted-link" aria-disabled="true">忘记了密码？</span>
      </div>
      <div className="form-message-slot">
        {error ? <p className="form-message error" role="alert">{error}</p> : null}
        {status === "success" ? <p className="form-message success">登录成功，正在进入工作台</p> : null}
      </div>
      <button className="submit-button" type="submit" disabled={status !== "idle"}>
        {status === "loading" ? "登录中..." : status === "success" ? "登录成功" : "登录"}
      </button>
      <div className="form-divider" />
      <p className="signup-copy">
        没有账户？<Link href="/register">创建你的码途 AI 账户</Link>
      </p>
      <p className="legal-copy">
        登录即表示你同意码途 AI 的 <span>服务条款</span> 和 <span>隐私政策</span>。
      </p>
    </form>
  );
}

function getRememberedIdentifier(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("hirescope.rememberedIdentifier")
    ?? localStorage.getItem("hirescope.rememberedEmail")
    ?? "";
}
