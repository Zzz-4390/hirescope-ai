"use client";

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type AsyncTask,
  type Project,
  type ProjectAnalysis,
  getProject,
  getProjectAnalysis,
  getTask,
  isTerminalTaskStatus,
} from "../lib/projects";

interface ProjectDetailClientProps {
  projectId: string;
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [task, setTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const taskStorageKey = useMemo(() => `hirescope.projectTask.${projectId}`, [projectId]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadInitial() {
      try {
        const currentProject = await getProject(projectId);
        if (!mounted) return;
        setProject(currentProject);
        await tryLoadAnalysis();
        const storedTaskId = sessionStorage.getItem(taskStorageKey);
        if (storedTaskId) {
          await pollTask(storedTaskId);
        } else if (currentProject.status !== "COMPLETED" && currentProject.status !== "FAILED") {
          scheduleProjectRefresh();
        }
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "项目详情加载失败");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    async function tryLoadAnalysis() {
      try {
        const currentAnalysis = await getProjectAnalysis(projectId);
        if (!mounted) return;
        setAnalysis(currentAnalysis);
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === "PROJECT_ANALYSIS_NOT_READY") return;
        if (cause instanceof ApiError && cause.status === 409) return;
        if (mounted) setError(cause instanceof Error ? cause.message : "分析结果加载失败");
      }
    }

    async function pollTask(taskId: string) {
      try {
        const currentTask = await getTask(taskId);
        if (!mounted) return;
        setTask(currentTask);
        const currentProject = await getProject(projectId);
        if (!mounted) return;
        setProject(currentProject);

        if (isTerminalTaskStatus(currentTask.status)) {
          sessionStorage.removeItem(taskStorageKey);
          if (currentTask.status === "SUCCEEDED") await tryLoadAnalysis();
          return;
        }
        timer = setTimeout(() => void pollTask(taskId), 2500);
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "任务状态加载失败");
      }
    }

    async function refreshProjectUntilDone() {
      try {
        const currentProject = await getProject(projectId);
        if (!mounted) return;
        setProject(currentProject);
        await tryLoadAnalysis();
        if (currentProject.status === "COMPLETED" || currentProject.status === "FAILED") return;
        scheduleProjectRefresh();
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "项目状态刷新失败");
      }
    }

    function scheduleProjectRefresh() {
      timer = setTimeout(() => void refreshProjectUntilDone(), 3000);
    }

    void loadInitial();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, taskStorageKey]);

  if (isLoading) {
    return (
      <div className="state-panel">
        <RefreshCw aria-hidden="true" />
        <span>正在加载项目详情...</span>
      </div>
    );
  }

  return (
    <section className="app-page">
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {project ? (
        <>
          <div className="page-heading">
            <div>
              <span>项目详情</span>
              <h1>{project.name}</h1>
              <p>{project.description || "暂无描述"}</p>
            </div>
            <div className="page-actions">
              <StatusBadge status={project.status} />
              <Link className="primary-button compact" href={`/app/projects/${project.id}/review`}>
                代码审查
              </Link>
            </div>
          </div>

          <div className="detail-grid">
            <article className="detail-panel">
              <h2>分析状态</h2>
              <div className="status-line">
                {task && !isTerminalTaskStatus(task.status) ? <Loader2 aria-hidden="true" /> : null}
                {task?.status === "SUCCEEDED" ? <CheckCircle2 aria-hidden="true" /> : null}
                {task?.status === "FAILED" || task?.status === "CANCELLED" ? <AlertCircle aria-hidden="true" /> : null}
                <span>{task ? taskStatusText(task.status) : projectStatusText(project.status)}</span>
              </div>
              {task?.failure ? <p className="muted-text">{task.failure.message || task.failure.code}</p> : null}
              {project.failure ? <p className="muted-text">{project.failure.message || project.failure.code}</p> : null}
            </article>

            <article className="detail-panel">
              <h2>文件信息</h2>
              <dl className="meta-list">
                <div><dt>文件名</dt><dd>{project.originalFileName}</dd></div>
                <div><dt>文件大小</dt><dd>{formatFileSize(project.fileSize)}</dd></div>
                <div><dt>更新时间</dt><dd>{formatDate(project.updatedAt)}</dd></div>
              </dl>
            </article>
          </div>

          <AnalysisView analysis={analysis} projectStatus={project.status} />
        </>
      ) : (
        <div className="empty-panel">
          <AlertCircle aria-hidden="true" />
          <h2>项目不存在</h2>
          <p>请返回项目列表确认该项目是否仍然存在。</p>
        </div>
      )}
    </section>
  );
}

function AnalysisView({ analysis, projectStatus }: { analysis: ProjectAnalysis | null; projectStatus: Project["status"] }) {
  if (!analysis) {
    return (
      <div className="state-panel">
        <Loader2 aria-hidden="true" />
        <span>{projectStatus === "FAILED" ? "分析失败，暂无结果" : "分析结果尚未生成"}</span>
      </div>
    );
  }

  return (
    <div className="analysis-grid">
      <article className="detail-panel wide">
        <h2>项目摘要</h2>
        <p>{analysis.summary}</p>
      </article>
      <JsonPanel title="技术栈" value={analysis.techStack} />
      <JsonPanel title="目录结构" value={analysis.directoryTree} />
      <JsonPanel title="核心模块" value={analysis.coreModules} />
      <JsonPanel title="入口文件" value={analysis.entryFiles} />
      <JsonPanel title="统计信息" value={analysis.statistics} />
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <article className="detail-panel">
      <h2>{title}</h2>
      <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>
    </article>
  );
}

function StatusBadge({ status }: { status: Project["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{projectStatusText(status)}</span>;
}

function projectStatusText(status: Project["status"]): string {
  const map: Record<Project["status"], string> = {
    UPLOADED: "已上传",
    QUEUED: "排队中",
    ANALYZING: "分析中",
    COMPLETED: "已完成",
    FAILED: "失败",
    DELETING: "删除中",
    DELETED: "已删除",
  };
  return map[status] ?? status;
}

function taskStatusText(status: AsyncTask["status"]): string {
  const map: Record<AsyncTask["status"], string> = {
    PENDING: "等待处理",
    QUEUED: "排队中",
    PROCESSING: "处理中",
    SUCCEEDED: "分析完成",
    FAILED: "分析失败",
    CANCELLED: "已取消",
  };
  return map[status] ?? status;
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
