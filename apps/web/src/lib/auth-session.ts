export const AUTH_SESSION_EXPIRED_EVENT = "hirescope:auth-session-expired";
export const AUTH_SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";

const LOGIN_NOTICE_STORAGE_KEY = "hirescope.loginNotice";

export function saveLoginNotice(message: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOGIN_NOTICE_STORAGE_KEY, message);
}

export function takeLoginNotice(): string {
  if (typeof window === "undefined") return "";
  const message = sessionStorage.getItem(LOGIN_NOTICE_STORAGE_KEY) ?? "";
  sessionStorage.removeItem(LOGIN_NOTICE_STORAGE_KEY);
  return message;
}
