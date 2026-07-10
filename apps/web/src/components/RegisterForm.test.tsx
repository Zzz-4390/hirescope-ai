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

    expect(screen.getByLabelText("密码")).toHaveAttribute("minlength", "6");
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

    await user.type(screen.getByLabelText("电子邮箱"), "candidate@example.com");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "candidate@example.com", password: "123456" }),
      }),
    );
    expect(localStorage.getItem("hirescope.rememberedEmail")).toBe("candidate@example.com");
    expect(push).toHaveBeenCalledWith("/login");
  });
});
