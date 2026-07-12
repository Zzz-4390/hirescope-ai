"use client";

import { BarChart3, BotMessageSquare, Clock3, FileQuestion, FolderOpen, MessageSquareText, RefreshCw, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Interview } from "../lib/interviews";
import { listAllProjectInterviews, listAllProjects, type ProjectInterviewItem } from "../lib/project-collections";
import { AppPage, DataSurface, EmptyHero, PageHeader, ProcessSteps } from "./AppPageUI";

const interviewSteps = [
  { title: "上传项目并完成分析", description: "系统解析项目技术栈与核心模块", icon: FolderOpen },
  { title: "生成专属面试题", description: "AI 基于项目内容生成个性化问题", icon: FileQuestion },
  { title: "开始模拟面试", description: "在仿真环境中完成真实作答", icon: BotMessageSquare },
  { title: "查看面试报告", description: "获取评分、反馈与改进建议", icon: BarChart3 },
];

export function AppInterviewsClient() {
  const [items, setItems] = useState<ProjectInterviewItem[]>([]);
  const [hasProjects, setHasProjects] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInterviews = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const projects = await listAllProjects();
      setHasProjects(projects.length > 0);
      setItems(projects.length === 0 ? [] : await listAllProjectInterviews(projects));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模拟面试加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInitialInterviews() {
      try {
        const projects = await listAllProjects();
        if (!active) return;
        setHasProjects(projects.length > 0);
        const interviews = projects.length === 0 ? [] : await listAllProjectInterviews(projects);
        if (active) setItems(interviews);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "模拟面试加载失败");
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadInitialInterviews();
    return () => { active = false; };
  }, []);

  return (
    <AppPage>
      <PageHeader title="模拟面试" description="基于项目内容，AI 为你生成专属面试题并进行智能评估，帮助你在真实面试前充分准备。" />
      {isLoading ? <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载模拟面试...</span></div> : null}
      {!isLoading && error ? <LoadFailure message={error} onRetry={loadInterviews} /> : null}
      {!isLoading && !error && items.length === 0 ? <EmptyInterviews hasProjects={hasProjects} /> : null}
      {!isLoading && !error && items.length > 0 ? <DataSurface><InterviewList items={items} /></DataSurface> : null}
    </AppPage>
  );
}

function EmptyInterviews({ hasProjects }: { hasProjects: boolean }) {
  return (
    <>
      <EmptyHero
        kind="interview"
        title="暂无模拟面试"
        description="上传项目并完成分析后，AI 将为你生成专属面试题，开启沉浸式模拟面试体验。"
        action={<Link className="primary-button compact" href={hasProjects ? "/app/projects" : "/app/projects/new"}><UploadCloud aria-hidden="true" />{hasProjects ? "前往项目页" : "上传项目"}</Link>}
        hint="面试题将结合你的技术栈与实际开发经历生成"
      />
      <ProcessSteps title="面试流程预览" items={interviewSteps} />
    </>
  );
}

function InterviewList({ items }: { items: ProjectInterviewItem[] }) {
  return (
    <div className="interview-history-panel">
      <div className="panel-title"><h2>面试记录</h2><span>{items.length} 条</span></div>
      <div className="interview-history-list">
        {items.map(({ project, interview }) => <InterviewListItem key={interview.id} projectName={project.name} interview={interview} />)}
      </div>
    </div>
  );
}

function InterviewListItem({ projectName, interview }: { projectName: string; interview: Interview }) {
  const isReport = ["SUBMITTED", "REPORT_GENERATING", "COMPLETED"].includes(interview.status);
  const isUnavailable = ["GENERATING", "FAILED"].includes(interview.status);
  const destination = isReport ? `/app/interviews/${interview.id}/report` : `/app/interviews/${interview.id}`;

  return (
    <article>
      <div className="interview-history-icon">{isUnavailable ? <Clock3 aria-hidden="true" /> : <MessageSquareText aria-hidden="true" />}</div>
      <div><strong>{interview.title}</strong><span>{projectName} · {difficultyText(interview.difficulty)} · {interview.questionCount} 题</span></div>
      <span className={`status-badge ${interview.status.toLowerCase()}`}>{statusText(interview.status)}</span>
      {isUnavailable ? <span className="history-action muted">{interview.status === "GENERATING" ? "生成中" : "不可进入"}</span> : <Link className="history-action" href={destination}>{isReport ? "查看报告" : interview.status === "READY" ? "开始面试" : "继续作答"}</Link>}
    </article>
  );
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <div className="empty-panel"><h2>模拟面试加载失败</h2><p>{message}</p><button className="primary-button compact" type="button" onClick={() => void onRetry()}>重试</button></div>;
}

function difficultyText(value: Interview["difficulty"]): string {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[value];
}

function statusText(value: Interview["status"]): string {
  return { GENERATING: "生成题目中", READY: "待开始", IN_PROGRESS: "作答中", SUBMITTED: "已提交", REPORT_GENERATING: "生成报告中", COMPLETED: "已完成", FAILED: "失败" }[value];
}
