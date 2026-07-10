const ACCESS_TOKEN_KEY = "hirescope.accessToken";

export function saveAccessToken(accessToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.dispatchEvent(new Event("auth-change"));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.dispatchEvent(new Event("auth-change"));
}
