import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "./api";
import { saveAccessToken } from "./auth";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  AUTH_SESSION_EXPIRED_MESSAGE,
} from "./auth-session";

describe("apiRequest", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends JSON requests with the saved access token", async () => {
    saveAccessToken("token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiRequest("/auth/me")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("refreshes once and retries the original request after a 401", async () => {
    saveAccessToken("expired-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: "fresh-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "user-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiRequest("/auth/me")).resolves.toEqual({ id: "user-1" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
    const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh-token");
    expect(localStorage.getItem("hirescope.accessToken")).toBe("fresh-token");
  });

  it("shares one refresh request across concurrent 401 responses", async () => {
    saveAccessToken("expired-token");
    let refreshResolver: ((response: Response) => void) | undefined;
    const refreshPromise = new Promise<Response>((resolve) => {
      refreshResolver = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/v1/auth/refresh") return refreshPromise;
      if (fetchMock.mock.calls.filter(([url]) => url === "/api/v1/projects").length <= 2) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const first = apiRequest("/projects");
    const second = apiRequest("/projects");
    await Promise.resolve();
    refreshResolver?.(
      new Response(JSON.stringify({ accessToken: "fresh-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { items: [] },
      { items: [] },
    ]);

    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/auth/refresh")).toHaveLength(1);
  });

  it("expires the local session and redirects through the auth boundary when refresh fails", async () => {
    saveAccessToken("expired-token");
    const expiredListener = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expiredListener);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "access token expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "请求来源不受信任" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const error = await apiRequest("/auth/me").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: AUTH_SESSION_EXPIRED_MESSAGE,
      status: 401,
      code: "AUTH_SESSION_EXPIRED",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(localStorage.getItem("hirescope.accessToken")).toBeNull();
    expect(sessionStorage.getItem("hirescope.loginNotice")).toBe(AUTH_SESSION_EXPIRED_MESSAGE);
    expect(expiredListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expiredListener);
  });

  it("expires the session when the retried request still returns 401", async () => {
    saveAccessToken("expired-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 401 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: "fresh-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ).mockResolvedValueOnce(
      new Response("{}", { status: 401 }),
    );

    await expect(apiRequest("/auth/me")).rejects.toMatchObject({
      message: AUTH_SESSION_EXPIRED_MESSAGE,
      status: 401,
      code: "AUTH_SESSION_EXPIRED",
    });
    expect(localStorage.getItem("hirescope.accessToken")).toBeNull();
  });

  it("does not set a JSON content type for FormData uploads", async () => {
    saveAccessToken("token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = new FormData();
    body.append("name", "Demo");

    await apiRequest("/projects", { method: "POST", body });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).not.toHaveProperty("Content-Type");
  });
});
