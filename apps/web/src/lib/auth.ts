import { apiRequest } from "./api";
import {
  clearAccessToken,
  getAccessToken,
  saveAccessToken,
} from "./auth-storage";

export { clearAccessToken, getAccessToken, saveAccessToken };

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl: string | null;
}

interface LoginResponse {
  accessToken: string;
  expiresIn?: number;
  user?: CurrentUser;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface ErrorEnvelope {
  error?: {
    message?: string;
  };
  message?: string;
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const payload = await authRequest<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });

  if (!payload.accessToken) {
    throw new Error("登录响应缺少 accessToken，请稍后重试");
  }

  return payload;
}

export async function register(input: RegisterInput): Promise<{ accepted: true }> {
  return authRequest<{ accepted: true }>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>("/auth/me");
}

export function uploadAvatar(file: File): Promise<CurrentUser> {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<CurrentUser>("/auth/me/avatar", { method: "PUT", body });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  await apiRequest<void>("/auth/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  clearAccessToken();
}

export async function logout(): Promise<void> {
  try {
    await authRequest<void>("/api/v1/auth/logout", { method: "POST" });
  } finally {
    clearAccessToken();
  }
}

async function authRequest<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new Error("暂时无法连接认证服务，请稍后重试");
  }

  const payload = await response.json().catch(() => ({})) as T & ErrorEnvelope;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.message ?? "认证请求失败，请稍后重试");
  }

  return payload;
}
