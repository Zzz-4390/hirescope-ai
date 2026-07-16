import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppAvatarContext, AppUserContext } from "../AppUserContext";
import { ProfileCenter } from "./ProfileCenter";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const currentUser = {
  id: "user-1",
  username: "candidate_01",
  email: "candidate@example.com",
  displayName: "不应显示的昵称",
  avatarUrl: null,
};

function renderProfile(avatarUrl: string | null = null, setAvatarUrl = vi.fn()) {
  return render(
    <AppUserContext.Provider value={{ ...currentUser, avatarUrl }}>
      <AppAvatarContext.Provider value={{ avatarUrl, setAvatarUrl }}>
        <ProfileCenter />
      </AppAvatarContext.Provider>
    </AppUserContext.Provider>,
  );
}

describe("ProfileCenter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/profile");
    localStorage.clear();
    sessionStorage.clear();
    replace.mockReset();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:avatar-preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders only the requested profile identity and readonly fields", () => {
    renderProfile();

    expect(screen.getByRole("heading", { name: "个人资料", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText("candidate_01").length).toBeGreaterThan(1);
    expect(screen.getAllByText("candidate@example.com").length).toBeGreaterThan(1);
    expect(screen.queryByText("不应显示的昵称")).not.toBeInTheDocument();
    expect(screen.getByText("用于登录，暂不支持修改")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更换邮箱" })).toBeDisabled();
  });

  it("previews a selected avatar, uploads it, and publishes the signed URL", async () => {
    const setAvatarUrl = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...currentUser,
      avatarUrl: "https://signed.example/avatar.png",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    renderProfile(null, setAvatarUrl);
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("选择头像文件"), { target: { files: [file] } });
    const preview = screen.getAllByRole("img", { name: "candidate_01的头像" })
      .map((element) => element.querySelector("img"))
      .find((element) => element !== null);
    expect(preview).toHaveAttribute("src", "blob:avatar-preview");
    expect(screen.getByText("已选择：avatar.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    await waitFor(() => expect(setAvatarUrl).toHaveBeenCalledWith("https://signed.example/avatar.png"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me/avatar",
      expect.objectContaining({ method: "PUT", body: expect.any(FormData) }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("已同步到个人中心与顶部导航");
  });

  it("rejects unsupported avatar formats and oversized files before upload", () => {
    renderProfile();
    const input = screen.getByLabelText("选择头像文件");

    fireEvent.change(input, { target: { files: [new File(["avatar"], "avatar.gif", { type: "image/gif" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("JPG、PNG 或 WebP");

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert")).toHaveTextContent("不能超过 5MB");
    expect(screen.getByRole("button", { name: "上传头像" })).toBeDisabled();
  });

  it("validates password confirmation and unchanged passwords before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderProfile();
    await user.click(screen.getByRole("button", { name: "账户安全" }));

    await user.type(screen.getByLabelText("当前密码"), "current-password");
    await user.type(screen.getByLabelText("新密码"), "new-password");
    await user.type(screen.getByLabelText("确认密码"), "different-password");
    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的新密码不一致");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears auth state and redirects after a successful password change", async () => {
    const user = userEvent.setup();
    localStorage.setItem("hirescope.accessToken", "token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    renderProfile();
    await user.click(screen.getByRole("button", { name: "账户安全" }));

    await user.type(screen.getByLabelText("当前密码"), "current-password");
    await user.type(screen.getByLabelText("新密码"), "new-password");
    await user.type(screen.getByLabelText("确认密码"), "new-password");
    await user.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/password",
      expect.objectContaining({ method: "POST" }),
    );
    expect(localStorage.getItem("hirescope.accessToken")).toBeNull();
    expect(sessionStorage.getItem("hirescope.loginNotice")).toBe("密码修改成功，请重新登录");
  });

  it("prevents duplicate password submissions while the request is pending", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
    renderProfile();
    await user.click(screen.getByRole("button", { name: "账户安全" }));
    await user.type(screen.getByLabelText("当前密码"), "current-password");
    await user.type(screen.getByLabelText("新密码"), "new-password");
    await user.type(screen.getByLabelText("确认密码"), "new-password");

    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("button", { name: "正在修改..." })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "正在修改..." }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("describes the persisted theme controls available from the account menu", () => {
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "偏好设置" }));
    expect(screen.getByText("浅色 / 深色主题")).toBeInTheDocument();
    expect(screen.getByText(/可从右上角头像菜单切换界面主题/)).toBeInTheDocument();
  });
});
