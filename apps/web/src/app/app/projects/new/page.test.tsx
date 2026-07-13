import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewProjectPage from "./page";

const pushMock = vi.fn();
const uploadProjectMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../../../../lib/projects", () => ({
  uploadProject: (...args: unknown[]) => uploadProjectMock(...args),
}));

describe("NewProjectPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    uploadProjectMock.mockReset();
    sessionStorage.clear();
  });

  it("enforces the 100-character project name and expands the optional description", async () => {
    const user = userEvent.setup();
    render(<NewProjectPage />);

    expect(screen.getByLabelText(/项目名称/)).toHaveAttribute("maxlength", "100");
    expect(screen.getByText("0 / 100")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加项目描述（可选）" }));

    expect(screen.getByLabelText("项目描述（可选）")).toBeInTheDocument();
  });

  it("keeps submit disabled until the name and ZIP file are valid", async () => {
    const user = userEvent.setup();
    const { container } = render(<NewProjectPage />);
    const submitButton = screen.getByRole("button", { name: "上传并开始分析" });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(fileInput).not.toBeNull();
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/项目名称/), "个人博客系统");
    fireEvent.drop(screen.getByRole("button", { name: "选择 ZIP 文件" }), {
      dataTransfer: { files: [new File(["text"], "project.txt", { type: "text/plain" })] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("只能上传 .zip 文件");
    expect(submitButton).toBeDisabled();

    await user.upload(fileInput!, new File(["zip"], "project.zip", { type: "application/zip" }));

    expect(screen.getByText("project.zip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除已选文件" })).toBeInTheDocument();
    expect(submitButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "移除已选文件" }));
    expect(submitButton).toBeDisabled();
  });

  it("locks duplicate actions while uploading and exposes a retryable failure", async () => {
    const user = userEvent.setup();
    const { container } = render(<NewProjectPage />);
    let rejectUpload: (cause: Error) => void = () => undefined;
    uploadProjectMock.mockReturnValue(new Promise((_, reject) => { rejectUpload = reject; }));

    await user.type(screen.getByLabelText(/项目名称/), "个人博客系统");
    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["zip"], "project.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "上传并开始分析" }));

    expect(await screen.findByRole("button", { name: "上传中..." })).toBeDisabled();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')).toBeDisabled();
    expect(screen.getByText("正在上传并创建分析任务")).toBeInTheDocument();

    rejectUpload(new Error("上传服务暂时不可用"));

    expect(await screen.findByRole("alert")).toHaveTextContent("上传服务暂时不可用");
    expect(screen.getByRole("button", { name: "上传并开始分析" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重新选择文件" })).toBeInTheDocument();
  });

  it("submits the existing upload contract once and redirects to project detail", async () => {
    const user = userEvent.setup();
    const { container } = render(<NewProjectPage />);
    const file = new File(["zip"], "project.zip", { type: "application/zip" });
    uploadProjectMock.mockResolvedValue({ project: { id: "project-1" }, task: { id: "task-1" } });

    await user.type(screen.getByLabelText(/项目名称/), " 个人博客系统 ");
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await user.click(screen.getByRole("button", { name: "上传并开始分析" }));

    await waitFor(() => {
      expect(uploadProjectMock).toHaveBeenCalledTimes(1);
      expect(uploadProjectMock).toHaveBeenCalledWith({
        name: "个人博客系统",
        description: undefined,
        file,
      });
      expect(sessionStorage.getItem("hirescope.projectTask.project-1")).toBe("task-1");
      expect(pushMock).toHaveBeenCalledWith("/app/projects/project-1");
    });
  });
});
