"use client";

import { AlertCircle, CheckCircle2, Clock3, FileSearch, Loader2, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import { type AsyncTask, type Project, getProject, getTask, isTerminalTaskStatus } from "../lib/projects";
import {
  type CodeReview,
  type CodeReviewDetail,
  createCodeReview,
  getCodeReview,
  listCodeReviews,
} from "../lib/reviews";

interface CodeReviewClientProps {
  projectId: string;
}

const ACTIVE_REVIEW_STATUSES = new Set(["PENDING", "QUEUED", "PROCESSING"]);

export function CodeReviewClient({ projectId }: CodeReviewClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<CodeReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<CodeReviewDetail | null>(null);
  const [activeTask, setActiveTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeReview = useMemo(
    () => reviews.find((review) => ACTIVE_REVIEW_STATUSES.has(review.status)),
    [reviews],
  );
  const canCreate = project?.status === "COMPLETED" && !activeReview && !isCreating;

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadInitial() {
      try {
        const [currentProject, history] = await Promise.all([
          getProject(projectId),
          listCodeReviews(projectId),
        ]);
        if (!mounted) return;
        setProject(currentProject);
        setReviews(history.items);
        setError("");

        const firstReview = history.items[0];
        if (firstReview) {
          await loadReview(firstReview.id);
          if (ACTIVE_REVIEW_STATUSES.has(firstReview.status)) {
            await pollReview(firstReview.id);
          }
        }
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "代码审查页面加载失败");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    async function loadReview(reviewId: string) {
      const detail = await getCodeReview(reviewId);
      if (!mounted) return null;
      setSelectedReview(detail);
      setActiveTask(detail.task);
      return detail;
    }

    async function pollReview(reviewId: string, taskId?: string) {
      try {
        const detail = await loadReview(reviewId);
        const currentTaskId = taskId ?? detail?.task?.id;
        if (currentTaskId) {
          const task = await getTask(currentTaskId);
          if (!mounted) return;
          setActiveTask(task);
          if (!isTerminalTaskStatus(task.status)) {
            timer = setTimeout(() => void pollReview(reviewId, currentTaskId), 2500);
            return;
          }
        } else if (detail && ACTIVE_REVIEW_STATUSES.has(detail.status)) {
          timer = setTimeout(() => void pollReview(reviewId), 2500);
          return;
        }
        await refreshHistory();
        await loadReview(reviewId);
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "代码审查任务状态刷新失败");
      }
    }

    async function refreshHistory() {
      const history = await listCodeReviews(projectId);
      if (!mounted) return;
      setReviews(history.items);
    }

    void loadInitial();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);

  async function refreshPage() {
    setError("");
    setNotice("");
    try {
      const [currentProject, history] = await Promise.all([
        getProject(projectId),
        listCodeReviews(projectId),
      ]);
      setProject(currentProject);
      setReviews(history.items);
      if (selectedReview) {
        setSelectedReview(await getCodeReview(selectedReview.id));
      } else if (history.items[0]) {
        setSelectedReview(await getCodeReview(history.items[0].id));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "刷新代码审查状态失败");
    }
  }

  async function handleCreateReview() {
    setError("");
    setNotice("");
    if (!project || project.status !== "COMPLETED") {
      setNotice("项目分析完成后才能创建代码审查。");
      return;
    }

    setIsCreating(true);
    try {
      const created = await createCodeReview(projectId);
      const history = await listCodeReviews(projectId);
      setReviews(history.items);
      setSelectedReview(await getCodeReview(created.id));
      setActiveTask(created.task);
      void pollCreatedReview(created.id, created.task.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setNotice(cause.code === "TASK_ALREADY_ACTIVE" ? "已有代码审查任务正在运行，请等待当前任务完成。" : cause.message);
        const history = await listCodeReviews(projectId);
        setReviews(history.items);
        const running = history.items.find((review) => ACTIVE_REVIEW_STATUSES.has(review.status));
        if (running) setSelectedReview(await getCodeReview(running.id));
      } else {
        setError(cause instanceof Error ? cause.message : "创建代码审查失败");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function pollCreatedReview(reviewId: string, taskId: string) {
    try {
      const task = await getTask(taskId);
      setActiveTask(task);
      setSelectedReview(await getCodeReview(reviewId));
      if (!isTerminalTaskStatus(task.status)) {
        window.setTimeout(() => void pollCreatedReview(reviewId, taskId), 2500);
        return;
      }
      const history = await listCodeReviews(projectId);
      setReviews(history.items);
      setSelectedReview(await getCodeReview(reviewId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "代码审查任务轮询失败");
    }
  }

  async function handleSelectReview(reviewId: string) {
    setError("");
    setNotice("");
    try {
      const detail = await getCodeReview(reviewId);
      setSelectedReview(detail);
      setActiveTask(detail.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "代码审查结果加载失败");
    }
  }

  if (isLoading) {
    return (
      <div className="state-panel">
        <RefreshCw aria-hidden="true" />
        <span>正在加载代码审查...</span>
      </div>
    );
  }

  return (
    <section className="app-page">
      <div className="page-heading">
        <div>
          <span>代码审查</span>
          <h1>{project?.name ?? "项目代码审查"}</h1>
          <p>基于已完成的项目分析生成确定性代码审查报告，展示总分、优点、风险和改进建议。</p>
        </div>
        <div className="page-actions">
          <button className="ghost-action" type="button" onClick={refreshPage}>
            <RefreshCw aria-hidden="true" />
            刷新
          </button>
          <button className="primary-button compact" type="button" disabled={!canCreate} onClick={handleCreateReview}>
            {isCreating ? <Loader2 aria-hidden="true" /> : <Plus aria-hidden="true" />}
            创建审查
          </button>
        </div>
      </div>

      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {notice ? <p className="app-banner info" role="status">{notice}</p> : null}
      {project && project.status !== "COMPLETED" ? (
        <p className="app-banner warning" role="status">
          当前项目状态为 {projectStatusText(project.status)}，项目分析完成后才能创建代码审查。
        </p>
      ) : null}

      <div className="review-layout">
        <aside className="review-history">
          <div className="panel-title">
            <h2>历史记录</h2>
            <span>{reviews.length} 条</span>
          </div>
          {reviews.length === 0 ? (
            <div className="empty-inline">
              <FileSearch aria-hidden="true" />
              <span>暂无代码审查记录</span>
            </div>
          ) : (
            <div className="history-list">
              {reviews.map((review) => (
                <button
                  key={review.id}
                  className={selectedReview?.id === review.id ? "active" : ""}
                  type="button"
                  onClick={() => void handleSelectReview(review.id)}
                >
                  <strong>{review.summary || "代码审查任务"}</strong>
                  <span>
                    <StatusBadge status={review.status} />
                    <small>{formatDate(review.createdAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <ReviewResultPanel review={selectedReview} task={activeTask} projectId={projectId} />
      </div>
    </section>
  );
}

function ReviewResultPanel({ review, task, projectId }: { review: CodeReviewDetail | null; task: AsyncTask | null; projectId: string }) {
  if (!review) {
    return (
      <div className="review-result empty-panel">
        <FileSearch aria-hidden="true" />
        <h2>尚未选择审查记录</h2>
        <p>创建一次代码审查，或从左侧历史记录中选择已完成的报告。</p>
      </div>
    );
  }

  const isRunning = ACTIVE_REVIEW_STATUSES.has(review.status);
  const failure = review.failure ?? task?.failure;

  return (
    <div className="review-result">
      <div className="review-summary-panel">
        <div>
          <span>总分</span>
          <strong>{review.score ?? "--"}<small>/100</small></strong>
          <StatusBadge status={review.status} />
        </div>
        <p>{review.summary || review.result?.overview || statusMessage(review.status)}</p>
        {task ? (
          <div className="task-progress">
            {isRunning ? <Loader2 aria-hidden="true" /> : review.status === "SUCCEEDED" ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            <span>{taskStatusText(task.status)}{typeof task.progress === "number" ? ` · ${task.progress}%` : ""}</span>
          </div>
        ) : null}
        {failure ? <p className="failure-text">{failure.message || failure.code}</p> : null}
      </div>

      {review.result ? (
        <>
          <div className="dimension-grid">
            <DimensionCard title="可维护性" dimension={review.result.maintainability} />
            <DimensionCard title="安全性" dimension={review.result.security} />
            <DimensionCard title="性能" dimension={review.result.performance} />
          </div>

          <div className="review-sections">
            <ListPanel title="优点" items={review.result.strengths} tone="success" />
            <ListPanel title="风险" items={review.result.risks} tone="danger" />
            <ListPanel title="建议" items={review.result.suggestions} tone="info" />
          </div>
        </>
      ) : isRunning ? (
        <div className="state-panel compact">
          <Loader2 aria-hidden="true" />
          <span>代码审查任务正在处理，页面会自动轮询结果。</span>
        </div>
      ) : review.status === "FAILED" || review.status === "CANCELLED" ? (
        <div className="state-panel compact">
          <AlertCircle aria-hidden="true" />
          <span>本次代码审查未生成可展示结果。</span>
        </div>
      ) : (
        <div className="state-panel compact">
          <Clock3 aria-hidden="true" />
          <span>结果尚未生成，可稍后刷新查看。</span>
        </div>
      )}

      <Link className="muted-link review-back-link" href={`/app/projects/${projectId}`}>返回项目详情</Link>
    </div>
  );
}

function DimensionCard({ title, dimension }: { title: string; dimension: { score: number; summary: string } }) {
  return (
    <article className="dimension-card">
      <span>{title}</span>
      <strong>{dimension.score}<small>/100</small></strong>
      <p>{dimension.summary}</p>
    </article>
  );
}

function ListPanel({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" | "info" }) {
  return (
    <article className={`detail-panel list-panel ${tone}`}>
      <h2>{title}</h2>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function StatusBadge({ status }: { status: CodeReview["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{taskStatusText(status)}</span>;
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
    SUCCEEDED: "已完成",
    FAILED: "失败",
    CANCELLED: "已取消",
  };
  return map[status] ?? status;
}

function statusMessage(status: CodeReview["status"]): string {
  if (status === "FAILED") return "代码审查失败，请查看失败原因后重试。";
  if (status === "CANCELLED") return "代码审查已取消。";
  if (ACTIVE_REVIEW_STATUSES.has(status)) return "代码审查任务正在运行。";
  return "代码审查结果待生成。";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
