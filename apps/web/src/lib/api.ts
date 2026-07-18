import { clearAccessToken, getAccessToken, saveAccessToken } from "./auth-storage";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_SESSION_EXPIRED_MESSAGE,
  saveLoginNotice,
} from "./auth-session";

const API_PREFIX = "/api/v1";

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<string> | null = null;
let sessionExpirationError: ApiError | null = null;

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (sessionExpirationError && getAccessToken()) sessionExpirationError = null;
  return requestWithAuth<T>(path, options, false);
}

async function requestWithAuth<T>(path: string, options: RequestInit, retried: boolean): Promise<T> {
  const response = await sendRequest(path, options);

  if (response.status === 401 && sessionExpirationError) {
    throw sessionExpirationError;
  }

  if (response.status === 401 && !retried && !path.startsWith("/auth/refresh")) {
    await refreshAccessToken();
    return requestWithAuth<T>(path, options, true);
  }

  if (response.status === 401 && retried) {
    throw expireAuthSession();
  }

  return parseResponse<T>(response);
}

async function sendRequest(path: string, options: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const body = options.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    return await fetch(`${API_PREFIX}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError("网络连接失败，请稍后重试", 0, "NETWORK_ERROR");
  }
}

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= (async () => {
    const response = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    const payload = await parseResponse<RefreshResponse>(response);
    if (!payload.accessToken) {
      throw new ApiError(AUTH_SESSION_EXPIRED_MESSAGE, 401, "AUTH_REFRESH_MISSING_TOKEN");
    }
    saveAccessToken(payload.accessToken);
    return payload.accessToken;
  })()
    .catch(() => {
      throw expireAuthSession();
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function expireAuthSession(): ApiError {
  if (sessionExpirationError) return sessionExpirationError;

  sessionExpirationError = new ApiError(AUTH_SESSION_EXPIRED_MESSAGE, 401, "AUTH_SESSION_EXPIRED");
  clearAccessToken();
  saveLoginNotice(AUTH_SESSION_EXPIRED_MESSAGE);
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  return sessionExpirationError;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null) as ErrorEnvelope | T | null;

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null;
    const message = envelope?.error?.message ?? envelope?.message ?? fallbackMessage(response.status);
    const code = envelope?.error?.code ?? envelope?.code;
    throw new ApiError(message, response.status, code);
  }

  return payload as T;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "登录状态已失效，请重新登录";
  if (status === 403) return "没有权限执行该操作";
  if (status === 404) return "请求的资源不存在";
  if (status >= 500) return "服务暂时不可用，请稍后重试";
  return "请求失败，请稍后重试";
}
