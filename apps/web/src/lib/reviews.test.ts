import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCodeReview, getCodeReview, listCodeReviews } from "./reviews";

describe("reviews api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("creates a code review through the project route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "review-1", task: { id: "task-1" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(createCodeReview("project-1")).resolves.toMatchObject({ id: "review-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/code-reviews",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("lists review history with pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listCodeReviews("project-1")).resolves.toMatchObject({ items: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/code-reviews?page=1&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("loads a review result by id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "review-1", result: { overview: "Done" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getCodeReview("review-1")).resolves.toMatchObject({ result: { overview: "Done" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/code-reviews/review-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
