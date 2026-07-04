const ACCESS_TOKEN_KEY = "hirescope.accessToken";

interface LoginResponse {
  accessToken: string;
  expiresIn?: number;
}

interface ErrorEnvelope {
  error?: {
    message?: string;
  };
  message?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  let response: Response;

  try {
    response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("暂时无法连接登录服务，请稍后重试");
  }

  const payload = (await response.json().catch(() => ({}))) as LoginResponse &
    ErrorEnvelope;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? payload.message ?? "登录失败，请检查邮箱和密码",
    );
  }

  if (!payload.accessToken) {
    throw new Error("登录响应缺少 accessToken，请稍后重试");
  }

  return { accessToken: payload.accessToken, expiresIn: payload.expiresIn };
}

export function saveAccessToken(accessToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.dispatchEvent(new Event("auth-change"));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}
