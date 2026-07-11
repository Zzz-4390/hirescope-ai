"use client";

import { LockKeyhole, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { register } from "../lib/auth";

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("loading");
    try {
      await register({
        displayName: displayName.trim() || undefined,
        email: email.trim(),
        password,
      });
      localStorage.setItem("hirescope.rememberedEmail", email.trim());
      setStatus("success");
      router.push("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败，请稍后重试");
      setStatus("idle");
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h2>创建码途 AI 账户</h2>
      <label className="field">
        <span className="sr-only">显示名称</span>
        <UserRound aria-hidden="true" />
        <input
          type="text"
          autoComplete="name"
          placeholder="显示名称（可选）"
          aria-label="显示名称"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="sr-only">电子邮箱</span>
        <Mail aria-hidden="true" />
        <input
          type="email"
          autoComplete="email"
          placeholder="电子邮箱"
          aria-label="电子邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="sr-only">密码</span>
        <LockKeyhole aria-hidden="true" />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="至少 6 位密码"
          aria-label="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
        />
      </label>
      <div className="form-message-slot">
        {error ? <p className="form-message error" role="alert">{error}</p> : null}
        {status === "success" ? <p className="form-message success">注册成功，正在前往登录页</p> : null}
      </div>
      <button className="submit-button" type="submit" disabled={status !== "idle"}>
        {status === "loading" ? "注册中..." : status === "success" ? "注册成功" : "注册"}
      </button>
      <div className="form-divider" />
      <p className="signup-copy">
        已有账户？<Link href="/login">返回登录</Link>
      </p>
    </form>
  );
}
