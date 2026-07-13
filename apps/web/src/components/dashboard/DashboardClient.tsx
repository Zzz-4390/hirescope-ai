"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../../lib/api";
import { getInterviewReport, listInterviews, type Interview, type InterviewReport } from "../../lib/interviews";
import { getProject, getProjectAnalysis, listProjects, type Project, type ProjectAnalysis } from "../../lib/projects";
import { getCodeReview, listCodeReviews, type CodeReviewDetail } from "../../lib/reviews";
import { useAppProject, useAppUser } from "../AppUserContext";
import { AnalysisOverview } from "./AnalysisOverview";
import { CapabilityAndActivity } from "./CapabilityAndActivity";
import { CodeReviewOverview } from "./CodeReviewOverview";
import { EmptyDashboard } from "./EmptyDashboard";
import { getActivities, getPhaseStates, type DashboardSnapshot } from "./dashboard-model";
import styles from "./Dashboard.module.css";
import { GrowthTrack } from "./GrowthTrack";
import { InterviewOverview } from "./InterviewOverview";
import { RecentProjectsTable } from "./RecentProjectsTable";

interface ProjectDetailState {
  project: Project;
  analysis: ProjectAnalysis | null;
  review: CodeReviewDetail | null;
  interview: Interview | null;
  report: InterviewReport | null;
}

export function DashboardClient() {
  const user = useAppUser();
  const { selectedProjectId } = useAppProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ProjectDetailState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [projectListError, setProjectListError] = useState("");
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setProjectListError("");
    try {
      const response = await listProjects(1, 20);
      setProjects(response.items);
      setSelectedId((current) => current || response.items[0]?.id || "");
    } catch (cause) {
      setProjectListError(cause instanceof Error ? cause.message : "项目列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listProjects(1, 20)
      .then((response) => {
        if (!active) return;
        setProjects(response.items);
        setSelectedId((current) => current || response.items[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setProjectListError(cause instanceof Error ? cause.message : "项目列表加载失败");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) setSelectedId(selectedProjectId);
  }, [projects, selectedProjectId]);

  const loadProjectDetail = useCallback(async (projectId: string, active: () => boolean) => {
    const [project, reviews, interviews] = await Promise.all([getProject(projectId), listCodeReviews(projectId, 1, 1), listInterviews(projectId, 1, 1)]);
    const analysisPromise = getProjectAnalysis(projectId).catch((cause) => {
      if (cause instanceof ApiError && (cause.code === "PROJECT_ANALYSIS_NOT_READY" || cause.status === 409 || cause.status === 404)) return null;
      throw cause;
    });
    const reviewPromise = reviews.items[0] ? getCodeReview(reviews.items[0].id) : Promise.resolve(null);
    const interview = interviews.items[0] ?? null;
    const reportPromise = interview && ["REPORT_GENERATING", "COMPLETED"].includes(interview.status)
      ? getInterviewReport(interview.id).then((response) => response.report).catch((cause) => cause instanceof ApiError && [404, 409].includes(cause.status) ? null : Promise.reject(cause))
      : Promise.resolve(null);
    const [analysis, review, report] = await Promise.all([analysisPromise, reviewPromise, reportPromise]);
    if (!active()) return;
    setDetail({ project, analysis, review, interview, report });
    setProjects((current) => current.map((item) => item.id === project.id ? project : item));
    setError("");
    return shouldPoll(project, review, interview);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        setIsDetailLoading(true);
        const poll = await loadProjectDetail(selectedId, () => active);
        if (active && poll) timer = setTimeout(() => void refresh(), 3000);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "工作台数据加载失败");
      } finally {
        if (active) setIsDetailLoading(false);
      }
    };
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [loadProjectDetail, selectedId]);

  const snapshot = detail as DashboardSnapshot | null;
  const activities = useMemo(() => snapshot ? getActivities(snapshot) : [], [snapshot]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const userName = user?.displayName || user?.email?.split("@")[0] || "用户";

  if (isLoading) return <div className={styles.dashboardLoading}><RefreshCw aria-hidden="true" />正在加载工作台...</div>;

  if (projectListError) {
    return (
      <div className={styles.dashboardPage}>
        <div className={styles.emptyContent}>
          <div className="empty-panel">
            <h2>项目列表加载失败</h2>
            <p>{projectListError}</p>
            <button className="primary-button compact" type="button" onClick={() => void loadProjects()}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardPage}>
      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
      {snapshot ? <>
        <div className={styles.welcome}><h1>{greeting}，{userName} <span aria-hidden="true">👋</span></h1><p>{getTaskCopy(snapshot)}</p></div>
        <GrowthTrack states={getPhaseStates(snapshot)} projectId={snapshot.project.id} />
        <AnalysisOverview project={snapshot.project} analysis={snapshot.analysis} loading={isDetailLoading} />
        <CodeReviewOverview projectId={snapshot.project.id} review={snapshot.review} />
        <InterviewOverview projectId={snapshot.project.id} interview={snapshot.interview} reportScore={snapshot.report?.overallScore ?? null} />
        <CapabilityAndActivity report={snapshot.report} activities={activities} />
        <RecentProjectsTable projects={projects} />
      </> : <EmptyDashboard greeting={greeting} userName={userName} />}
    </div>
  );
}

function shouldPoll(project: Project, review: CodeReviewDetail | null, interview: Interview | null): boolean {
  return ["UPLOADED", "QUEUED", "ANALYZING"].includes(project.status)
    || Boolean(review && ["PENDING", "QUEUED", "PROCESSING"].includes(review.status))
    || Boolean(interview && ["GENERATING", "REPORT_GENERATING"].includes(interview.status));
}

function getTaskCopy(snapshot: DashboardSnapshot): string {
  if (snapshot.report) return "当前项目已完成完整成长流程，可查看能力报告与改进建议。";
  if (snapshot.interview) return "当前项目已进入模拟面试阶段，继续完成作答以生成能力报告。";
  if (snapshot.review) return "AI 已开始审查你的项目，关注代码质量、安全风险与可维护性。";
  if (snapshot.analysis) return "项目分析已完成，下一步可以生成 AI 代码审查。";
  return "系统正在分析你的项目，结果会自动更新。";
}
