"use client";

import { BarChart3, Code2, FileCheck2, FileText, Layers3, MessageSquareText, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getInterviewReport, type InterviewReport } from "../lib/interviews";
import { listAllProjectInterviews, listAllProjects, type ProjectInterviewItem } from "../lib/project-collections";
import { AppPage, DataSurface, EmptyHero, FeatureGrid, PageHeader, ProcessSteps } from "./AppPageUI";

const reportSteps = [
  { title: "上传项目", description: "提交 ZIP 项目", icon: UploadCloud },
  { title: "完成项目分析", description: "解析技术栈与核心模块", icon: BarChart3 },
  { title: "完成模拟面试", description: "提交所有面试作答", icon: MessageSquareText },
  { title: "生成能力报告", description: "汇总项目与面试表现", icon: FileCheck2 },
];

const reportFeatures = [
  { title: "综合能力评分", description: "多维度评估整体能力", icon: BarChart3 },
  { title: "技术栈掌握度", description: "评估技术熟练度与深度", icon: Layers3 },
  { title: "项目表现分析", description: "分析项目复杂度与实现质量", icon: Code2 },
  { title: "优势与改进建议", description: "识别优势并提供成长建议", icon: Sparkles },
  { title: "面试表现总结", description: "总结作答与思维方式", icon: MessageSquareText },
];

interface ReportItem extends ProjectInterviewItem {
  report: InterviewReport;
}

export function AppReportsClient() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [hasProjects, setHasProjects] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const projects = await listAllProjects();
      setHasProjects(projects.length > 0);
      if (projects.length === 0) {
        setReports([]);
        return;
      }

      const interviews = await listAllProjectInterviews(projects);
      const completed = interviews.filter(({ interview }) => interview.status === "COMPLETED");
      const results = await Promise.all(completed.map(async (item) => {
        const response = await getInterviewReport(item.interview.id);
        return response.report ? { ...item, report: response.report } : null;
      }));
      setReports(results.flatMap((item) => item ? [item] : []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "能力报告加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInitialReports() {
      try {
        const projects = await listAllProjects();
        if (!active) return;
        setHasProjects(projects.length > 0);
        if (projects.length === 0) return;

        const interviews = await listAllProjectInterviews(projects);
        const completed = interviews.filter(({ interview }) => interview.status === "COMPLETED");
        const results = await Promise.all(completed.map(async (item) => {
          const response = await getInterviewReport(item.interview.id);
          return response.report ? { ...item, report: response.report } : null;
        }));
        if (active) setReports(results.flatMap((item) => item ? [item] : []));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "能力报告加载失败");
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadInitialReports();
    return () => { active = false; };
  }, []);

  return (
    <AppPage>
      <PageHeader title="能力报告" description="基于项目分析、AI 代码审查和模拟面试的综合评估，清晰呈现技术能力与成长方向。" />

      {isLoading ? <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载能力报告...</span></div> : null}
      {!isLoading && error ? <LoadFailure message={error} onRetry={loadReports} /> : null}
      {!isLoading && !error && reports.length === 0 ? <EmptyReports hasProjects={hasProjects} /> : null}
      {!isLoading && !error && reports.length > 0 ? <DataSurface><ReportList reports={reports} /></DataSurface> : null}
    </AppPage>
  );
}

function EmptyReports({ hasProjects }: { hasProjects: boolean }) {
  return (
    <>
      <EmptyHero
        kind="report"
        title="暂无能力报告"
        description="完成以下流程后，我们将为你生成一份全面、可执行的个人能力报告。"
        action={<Link className="primary-button compact" href={hasProjects ? "/app/projects" : "/app/projects/new"}><UploadCloud aria-hidden="true" />{hasProjects ? "前往项目页" : "上传项目"}</Link>}
      />
      <ProcessSteps title="生成报告所需步骤" items={reportSteps} />
      <FeatureGrid title="能力报告包含内容" items={reportFeatures} />
    </>
  );
}

function ReportList({ reports }: { reports: ReportItem[] }) {
  return (
    <div className="interview-history-panel">
      <div className="panel-title"><h2>已生成报告</h2><span>{reports.length} 份</span></div>
      <div className="interview-history-list">
        {reports.map(({ project, interview, report }) => (
          <article key={report.id}>
            <div className="interview-history-icon"><FileText aria-hidden="true" /></div>
            <div><strong>{interview.title}</strong><span>{project.name} · 综合评分 {report.overallScore}/100</span></div>
            <span className="status-badge completed">已完成</span>
            <Link className="history-action" href={`/app/interviews/${interview.id}/report`}>查看报告</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <div className="empty-panel"><h2>能力报告加载失败</h2><p>{message}</p><button className="primary-button compact" type="button" onClick={() => void onRetry()}>重试</button></div>;
}
