import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, login, saveAccessToken } from "./auth";

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

    await expect(login("candidate@example.com", "wrong")).rejects.toThrow(
      "邮箱或密码错误",
    );
  });

  it("returns a clear message when the API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(login("candidate@example.com", "secret123")).rejects.toThrow(
      "暂时无法连接登录服务，请稍后重试",
    );
  });

  it("persists and reads the access token", () => {
    saveAccessToken("token-123");

    expect(getAccessToken()).toBe("token-123");
  });
});
