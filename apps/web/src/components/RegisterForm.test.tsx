import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./RegisterForm";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
    vi.restoreAllMocks();
  });

  it("shows and enforces a six-character password minimum", () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText("用户名")).toBeRequired();
    expect(screen.getByLabelText("用户名")).toHaveAttribute("minlength", "3");
    expect(screen.getByLabelText("用户名")).toHaveAttribute("maxlength", "30");
    expect(screen.getByLabelText("电子邮箱")).toBeRequired();
    expect(screen.getByLabelText("密码")).toHaveAttribute("minlength", "6");
    expect(screen.getByLabelText("确认密码")).toBeRequired();
    expect(screen.getByPlaceholderText("至少 6 位密码")).toBeInTheDocument();
  });

  it("submits a six-character password and opens the login page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("用户名"), " Candidate_01 ");
    await user.type(screen.getByLabelText("电子邮箱"), " Candidate@Example.COM ");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.type(screen.getByLabelText("确认密码"), "123456");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "candidate_01",
          email: "candidate@example.com",
          password: "123456",
          confirmPassword: "123456",
        }),
      }),
    );
    expect(localStorage.getItem("hirescope.rememberedIdentifier")).toBe("candidate_01");
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("rejects mismatched password confirmation before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("用户名"), "candidate_01");
    await user.type(screen.getByLabelText("电子邮箱"), "candidate@example.com");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.type(screen.getByLabelText("确认密码"), "654321");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
