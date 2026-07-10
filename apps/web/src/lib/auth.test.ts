import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAccessToken,
  getAccessToken,
  getCurrentUser,
  login,
  logout,
  register,
  saveAccessToken,
} from "./auth";

describe("auth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("submits the existing email/password login contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "token-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await login("candidate@example.com", "secret123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "candidate@example.com",
          password: "secret123",
        }),
      }),
    );
    expect(result.accessToken).toBe("token-123");
  });

  it("uses the backend error message when login fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "邮箱或密码错误" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(login("candidate@example.com", "wrong")).rejects.toThrow("邮箱或密码错误");
  });

  it("returns a clear message when the API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(login("candidate@example.com", "secret123")).rejects.toThrow(
      "暂时无法连接认证服务，请稍后重试",
    );
  });

  it("persists, reads and clears the access token", () => {
    saveAccessToken("token-123");
    expect(getAccessToken()).toBe("token-123");

    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it("submits the register contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(register({
      email: "new@example.com",
      password: "secret123",
      displayName: "New User",
    })).resolves.toEqual({ accepted: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "new@example.com",
          password: "secret123",
          displayName: "New User",
        }),
      }),
    );
  });

  it("loads the current user from /auth/me", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1", email: "candidate@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "candidate@example.com",
    });
  });

  it("logs out remotely and clears the access token", async () => {
    saveAccessToken("token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(getAccessToken()).toBeNull();
  });
});
