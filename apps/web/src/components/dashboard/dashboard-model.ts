import type { Interview, InterviewReport } from "../../lib/interviews";
import type { Project, ProjectAnalysis } from "../../lib/projects";
import type { CodeReviewDetail } from "../../lib/reviews";

export type DashboardPhaseState = "completed" | "processing" | "pending" | "failed";

export interface DashboardSnapshot {
  project: Project;
  analysis: ProjectAnalysis | null;
  review: CodeReviewDetail | null;
  interview: Interview | null;
  report: InterviewReport | null;
}

export interface AnalysisMetrics {
  techStack: string[];
  modules: Array<{ name: string; path?: string; description?: string }>;
  totalFiles: number | null;
  codeFiles: number | null;
  totalLines: number | null;
  languages: Array<{ name: string; value: number; percentage: number }>;
}

export interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  date: string;
  tone: "blue" | "green" | "red";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getAnalysisMetrics(analysis: ProjectAnalysis | null): AnalysisMetrics {
  const stack = Array.isArray(analysis?.techStack) ? analysis.techStack : [];
  const modules = Array.isArray(analysis?.coreModules) ? analysis.coreModules : [];
  const statistics = isRecord(analysis?.statistics) ? analysis.statistics : {};
  const languageRecord = isRecord(statistics.languages) ? statistics.languages : {};
  const languageValues = Object.entries(languageRecord)
    .map(([name, value]) => ({ name, value: finiteNumber(value) ?? 0 }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const languageTotal = languageValues.reduce((sum, item) => sum + item.value, 0);

  return {
    techStack: stack.flatMap((item) => isRecord(item) && typeof item.name === "string" ? [item.name] : []),
    modules: modules.flatMap((item) => isRecord(item) && typeof item.name === "string" ? [{
      name: item.name,
      path: typeof item.path === "string" ? item.path : undefined,
      description: typeof item.description === "string" ? item.description : undefined,
    }] : []),
    totalFiles: finiteNumber(statistics.totalFiles),
    codeFiles: finiteNumber(statistics.codeFiles) ?? (languageTotal || null),
    totalLines: finiteNumber(statistics.totalLines),
    languages: languageValues.map((item) => ({
      ...item,
      percentage: languageTotal > 0 ? Math.round((item.value / languageTotal) * 100) : 0,
    })),
  };
}

export function getPhaseStates(snapshot: DashboardSnapshot): DashboardPhaseState[] {
  const projectFailed = snapshot.project.status === "FAILED";
  const analysisDone = snapshot.project.status === "COMPLETED" && Boolean(snapshot.analysis);
  const analysisProcessing = ["UPLOADED", "QUEUED", "ANALYZING"].includes(snapshot.project.status);
  const reviewFailed = snapshot.review?.status === "FAILED";
  const reviewDone = snapshot.review?.status === "SUCCEEDED";
  const reviewProcessing = snapshot.review ? ["PENDING", "QUEUED", "PROCESSING"].includes(snapshot.review.status) : false;
  const interviewFailed = snapshot.interview?.status === "FAILED";
  const interviewDone = snapshot.interview ? ["SUBMITTED", "REPORT_GENERATING", "COMPLETED"].includes(snapshot.interview.status) : false;
  const interviewProcessing = snapshot.interview ? ["GENERATING", "READY", "IN_PROGRESS"].includes(snapshot.interview.status) : false;

  return [
    "completed",
    projectFailed ? "failed" : analysisDone ? "completed" : analysisProcessing ? "processing" : "pending",
    reviewFailed ? "failed" : reviewDone ? "completed" : reviewProcessing ? "processing" : "pending",
    interviewFailed ? "failed" : interviewDone ? "completed" : interviewProcessing ? "processing" : "pending",
    snapshot.report ? "completed" : snapshot.interview?.status === "REPORT_GENERATING" ? "processing" : "pending",
  ];
}

export function getActivities(snapshot: DashboardSnapshot): ActivityItem[] {
  const metrics = getAnalysisMetrics(snapshot.analysis);
  const items: ActivityItem[] = [{
    id: `project-${snapshot.project.id}`,
    label: "项目已上传",
    detail: `${snapshot.project.originalFileName} · ${formatFileSize(snapshot.project.fileSize)}`,
    date: snapshot.project.createdAt,
    tone: "green",
  }];

  if (snapshot.analysis) items.push({ id: `analysis-${snapshot.analysis.id}`, label: "项目分析完成", detail: `识别 ${metrics.totalFiles ?? "--"} 个文件`, date: snapshot.analysis.updatedAt, tone: "blue" });
  if (snapshot.review) items.push({ id: `review-${snapshot.review.id}`, label: snapshot.review.status === "FAILED" ? "AI 代码审查失败" : "AI 代码审查更新", detail: snapshot.review.summary || "审查任务状态已更新", date: snapshot.review.completedAt || snapshot.review.createdAt, tone: snapshot.review.status === "FAILED" ? "red" : "blue" });
  if (snapshot.interview) items.push({ id: `interview-${snapshot.interview.id}`, label: snapshot.interview.status === "COMPLETED" ? "模拟面试已完成" : "模拟面试已创建", detail: `${snapshot.interview.questionCount} 道题 · ${difficultyText(snapshot.interview.difficulty)}`, date: snapshot.interview.updatedAt, tone: snapshot.interview.status === "FAILED" ? "red" : "blue" });
  if (snapshot.report) items.push({ id: `report-${snapshot.report.id}`, label: "能力报告已生成", detail: `综合评分 ${snapshot.report.overallScore}/100`, date: snapshot.report.createdAt, tone: "green" });

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
}

export function difficultyText(value: Interview["difficulty"]): string {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[value];
}

export function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
