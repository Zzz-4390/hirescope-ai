import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAccessToken,
  getAccessToken,
  getCurrentUser,
  login,
  logout,
  register,
  saveAccessToken,
  changePassword,
  uploadAvatar,
} from "./auth";

describe("auth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("submits the identifier/password login contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "token-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await login("candidate_01", "secret123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          identifier: "candidate_01",
          password: "secret123",
        }),
      }),
    );
    expect(result.accessToken).toBe("token-123");
  });

  it("uses the backend error message when login fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "用户名、邮箱或密码错误" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(login("candidate@example.com", "wrong")).rejects.toThrow("用户名、邮箱或密码错误");
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
      username: "new_user",
      email: "new@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    })).resolves.toEqual({ accepted: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          username: "new_user",
          email: "new@example.com",
          password: "secret123",
          confirmPassword: "secret123",
        }),
      }),
    );
  });

  it("loads the current user from /auth/me", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1", username: "candidate_01", email: "candidate@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      username: "candidate_01",
      email: "candidate@example.com",
    });
  });

  it("uploads an avatar as multipart data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1", avatarUrl: "https://signed.example/avatar.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    await expect(uploadAvatar(file)).resolves.toMatchObject({ avatarUrl: "https://signed.example/avatar.png" });
    const [, options] = fetchMock.mock.calls[0]!;
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/auth/me/avatar");
    expect(options).toMatchObject({ method: "PUT", body: expect.any(FormData) });
    expect((options?.headers as Headers).has("Content-Type")).toBe(false);
  });

  it("changes the password and clears the access token only after success", async () => {
    saveAccessToken("token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await changePassword({ currentPassword: "current-password", newPassword: "new-password", confirmPassword: "new-password" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/password",
      expect.objectContaining({ method: "POST" }),
    );
    expect(getAccessToken()).toBeNull();
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

  it("keeps local auth state when remote logout returns a non-2xx response", async () => {
    saveAccessToken("token-123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "请求来源不受信任" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(logout()).rejects.toThrow("请求来源不受信任");
    expect(getAccessToken()).toBe("token-123");
  });

  it("keeps local auth state when remote logout is unavailable", async () => {
    saveAccessToken("token-123");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(logout()).rejects.toThrow("暂时无法连接认证服务，请稍后重试");
    expect(getAccessToken()).toBe("token-123");
  });
});
