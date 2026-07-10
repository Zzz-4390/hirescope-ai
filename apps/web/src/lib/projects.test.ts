import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProject, getProjectAnalysis, getTask, listProjects, uploadProject } from "./projects";

describe("projects api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("lists projects through the backend contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listProjects()).resolves.toMatchObject({ items: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects?page=1&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uploads a zip project using the file field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ project: { id: "project-1" }, task: { id: "task-1" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const file = new File(["zip"], "demo.zip", { type: "application/zip" });

    await uploadProject({ name: "Demo", description: "Test", file });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const formData = init?.body as FormData;
    expect(formData.get("name")).toBe("Demo");
    expect(formData.get("description")).toBe("Test");
    expect(formData.get("file")).toBe(file);
  });

  it("loads project detail and analysis from real routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/v1/projects/project-1") {
        return Promise.resolve(new Response(JSON.stringify({ id: "project-1", name: "Demo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ projectId: "project-1", summary: "Done" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });

    await expect(getProject("project-1")).resolves.toMatchObject({ id: "project-1" });
    await expect(getProjectAnalysis("project-1")).resolves.toMatchObject({ summary: "Done" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/projects/project-1", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/projects/project-1/analysis", expect.any(Object));
  });

  it("loads async task status for workflow polling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "task-1", status: "PROCESSING", progress: 40 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getTask("task-1")).resolves.toMatchObject({ status: "PROCESSING", progress: 40 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks/task-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
