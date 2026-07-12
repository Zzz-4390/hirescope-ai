import { describe, expect, it } from "vitest";

import type { InterviewReport } from "../../lib/interviews";
import type { Project, ProjectAnalysis } from "../../lib/projects";
import type { CodeReviewDetail } from "../../lib/reviews";
import { getActivities, getAnalysisMetrics, getPhaseStates, type DashboardSnapshot } from "./dashboard-model";

const project: Project = { id: "project-1", name: "Demo", originalFileName: "demo.zip", fileSize: 2048, status: "COMPLETED", failure: null, createdAt: "2026-07-10T10:00:00Z", updatedAt: "2026-07-10T10:05:00Z" };
const analysis: ProjectAnalysis = { id: "analysis-1", projectId: project.id, summary: "summary", techStack: [{ name: "TypeScript" }], directoryTree: [], coreModules: [{ name: "API", path: "src/api" }], entryFiles: [], statistics: { totalFiles: 4, totalLines: 120, languages: { TypeScript: 3, CSS: 1 } }, analyzerVersion: "test", createdAt: "2026-07-10T10:01:00Z", updatedAt: "2026-07-10T10:02:00Z" };

describe("dashboard model", () => {
  it("normalizes analysis metrics without inventing values", () => {
    expect(getAnalysisMetrics(analysis)).toMatchObject({ techStack: ["TypeScript"], totalFiles: 4, codeFiles: 4, totalLines: 120, languages: [{ name: "TypeScript", value: 3, percentage: 75 }, { name: "CSS", value: 1, percentage: 25 }] });
    expect(getAnalysisMetrics(null)).toMatchObject({ totalFiles: null, codeFiles: null, totalLines: null, languages: [] });
  });

  it("derives the five phases from real workflow states", () => {
    const review = { id: "review-1", status: "SUCCEEDED", summary: "done", score: 80, model: "test", failure: null, createdAt: "2026-07-10T10:03:00Z", completedAt: "2026-07-10T10:04:00Z", result: null, task: null } satisfies CodeReviewDetail;
    expect(getPhaseStates({ project, analysis, review, interview: null, report: null })).toEqual(["completed", "completed", "completed", "pending", "pending"]);
  });

  it("orders activity from real timestamps", () => {
    const report = { id: "report-1", overallScore: 76, summary: "done", dimensions: { projectUnderstanding: 80, technicalAccuracy: 70, communication: 76, problemSolving: 78 }, questionReviews: [], strengths: [], improvements: [], model: "test", createdAt: "2026-07-10T10:06:00Z" } satisfies InterviewReport;
    const snapshot: DashboardSnapshot = { project, analysis, review: null, interview: null, report };
    expect(getActivities(snapshot)[0]).toMatchObject({ label: "能力报告已生成", detail: "综合评分 76/100" });
  });
});
