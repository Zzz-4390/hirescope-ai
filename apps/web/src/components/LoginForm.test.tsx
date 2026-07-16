import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./LoginForm";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    push.mockReset();
    vi.restoreAllMocks();
  });

  it("shows the one-time password change success notice", () => {
    sessionStorage.setItem("hirescope.loginNotice", "密码修改成功，请重新登录");
    render(<LoginForm />);

    expect(screen.getByRole("status")).toHaveTextContent("密码修改成功，请重新登录");
    expect(sessionStorage.getItem("hirescope.loginNotice")).toBeNull();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const password = screen.getByLabelText("密码");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(password).toHaveAttribute("type", "text");
  });

  it("submits identifier/password, saves token and enters the app", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "token-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("用户名或邮箱"), "Candidate_01");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ body: JSON.stringify({ identifier: "candidate_01", password: "secret123" }) }),
    );
    expect(await screen.findByText("登录成功，正在进入工作台")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录成功" })).toBeDisabled();
    expect(localStorage.getItem("hirescope.accessToken")).toBe("token-123");
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("remembers the account identifier when requested", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "token-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("用户名或邮箱"), "candidate_01");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("checkbox", { name: "记住我的账号" }));
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(localStorage.getItem("hirescope.rememberedIdentifier")).toBe("candidate_01");
  });

  it("shows a loading state while the request is pending", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("用户名或邮箱"), "candidate@example.com");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByRole("button", { name: "登录中..." })).toBeDisabled();
  });

  it("shows a clear error without navigating", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "用户名、邮箱或密码错误" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("用户名或邮箱"), "candidate@example.com");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("用户名、邮箱或密码错误");
    expect(push).not.toHaveBeenCalled();
  });
});
