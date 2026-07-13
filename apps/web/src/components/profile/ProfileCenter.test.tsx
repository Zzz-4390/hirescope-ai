import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppAvatarContext, AppUserContext } from "../AppUserContext";
import { ProfileCenter } from "./ProfileCenter";

const user = {
  id: "user-1",
  username: "candidate_01",
  email: "candidate@example.com",
  displayName: "不应显示的昵称",
};

function renderProfile(avatarUrl: string | null = null, setAvatarFile = vi.fn()) {
  return render(
    <AppUserContext.Provider value={user}>
      <AppAvatarContext.Provider value={{ avatarUrl, setAvatarFile }}>
        <ProfileCenter />
      </AppAvatarContext.Provider>
    </AppUserContext.Provider>,
  );
}

describe("ProfileCenter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/profile");
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
    expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
  });

  it("accepts supported avatars up to 5MB and exposes removal", () => {
    const setAvatarFile = vi.fn();
    const { rerender } = renderProfile(null, setAvatarFile);
    const file = new File(["avatar"], "avatar.webp", { type: "image/webp" });

    fireEvent.change(screen.getByLabelText("选择头像文件"), { target: { files: [file] } });
    expect(setAvatarFile).toHaveBeenCalledWith(file);
    expect(screen.getByRole("status")).toHaveTextContent("同步到当前页面与顶部导航");

    rerender(
      <AppUserContext.Provider value={user}>
        <AppAvatarContext.Provider value={{ avatarUrl: "blob:avatar", setAvatarFile }}>
          <ProfileCenter />
        </AppAvatarContext.Provider>
      </AppUserContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "移除头像" }));
    expect(setAvatarFile).toHaveBeenLastCalledWith(null);
  });

  it("rejects unsupported avatar formats and oversized files", () => {
    const setAvatarFile = vi.fn();
    renderProfile(null, setAvatarFile);
    const input = screen.getByLabelText("选择头像文件");

    fireEvent.change(input, { target: { files: [new File(["avatar"], "avatar.gif", { type: "image/gif" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("JPG、PNG 或 WebP");

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert")).toHaveTextContent("不能超过 5MB");
    expect(setAvatarFile).not.toHaveBeenCalled();
  });

  it("keeps security limited to the three password fields without a fake request", () => {
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "账户安全" }));

    expect(screen.getByLabelText("当前密码")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("新密码")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("确认密码")).toHaveAttribute("type", "password");
    expect(screen.getAllByLabelText(/密码$/).filter((element) => element.tagName === "INPUT")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "修改密码暂不可用" })).toBeDisabled();
    expect(screen.queryByText(/设备管理|双因素认证|账号注销/)).not.toBeInTheDocument();
  });

  it("shows only the interface appearance that actually exists", () => {
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "偏好设置" }));

    expect(screen.getByText("浅色主题 · 蓝色界面")).toBeInTheDocument();
    expect(screen.getByText(/暂未提供可保存的主题或颜色切换能力/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
