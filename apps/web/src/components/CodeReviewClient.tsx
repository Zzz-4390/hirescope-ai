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

const POLL_INTERVAL_MS = 2500;
const ACTIVE_REVIEW_STATUSES: ReadonlySet<CodeReview["status"]> = new Set([
  "PENDING",
  "QUEUED",
  "PROCESSING",
]);

export function CodeReviewClient({ projectId }: CodeReviewClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<CodeReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<CodeReviewDetail | null>(null);
  const [activeTask, setActiveTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [pollingError, setPollingError] = useState("");
  const [notice, setNotice] = useState("");

  const activeReview = useMemo(
    () => reviews.find((review) => isActiveReviewStatus(review.status)),
    [reviews],
  );
  const canCreate = project?.status === "COMPLETED" && !activeReview && !isCreating;

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const [currentProject, history] = await Promise.all([
          getProject(projectId),
          listCodeReviews(projectId),
        ]);
        const initialReview = history.items.find((review) => isActiveReviewStatus(review.status)) ?? history.items[0];
        const detail = initialReview ? await getCodeReview(initialReview.id) : null;
        if (cancelled) return;

        setProject(currentProject);
        setReviews(history.items);
        setSelectedReview(detail);
        setActiveTask(detail?.task ?? null);
        setError("");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "代码审查页面加载失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedReview || !isActiveReviewStatus(selectedReview.status)) return;
    const reviewId = selectedReview.id;
    const taskId = selectedReview.task?.id;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      let shouldContinue = true;
      try {
        const [detail, task] = await Promise.all([
          getCodeReview(reviewId),
          taskId ? getTask(taskId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setSelectedReview(detail);
        setActiveTask(task ?? detail.task);
        setPollingError("");

        shouldContinue = isActiveReviewStatus(detail.status) && (task ? !isTerminalTaskStatus(task.status) : true);
        if (!shouldContinue) {
          const history = await listCodeReviews(projectId);
          if (!cancelled) setReviews(history.items);
        }
      } catch (cause) {
        if (!cancelled) {
          setPollingError(cause instanceof Error ? cause.message : "代码审查状态刷新失败，将自动重试");
        }
      } finally {
        if (!cancelled && shouldContinue) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    }

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, selectedReview?.id, selectedReview?.status, selectedReview?.task?.id]);

  async function refreshPage() {
    setError("");
    setPollingError("");
    setNotice("");
    setIsRefreshing(true);
    try {
      const [currentProject, history] = await Promise.all([
        getProject(projectId),
        listCodeReviews(projectId),
      ]);
      const reviewToLoad =
        history.items.find((review) => review.id === selectedReview?.id) ??
        history.items.find((review) => isActiveReviewStatus(review.status)) ??
        history.items[0];
      const detail = reviewToLoad ? await getCodeReview(reviewToLoad.id) : null;

      setProject(currentProject);
      setReviews(history.items);
      setSelectedReview(detail);
      setActiveTask(detail?.task ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "刷新代码审查状态失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateReview() {
    setError("");
    setPollingError("");
    setNotice("");
    if (!project || project.status !== "COMPLETED") {
      setNotice("项目分析完成后才能创建代码审查。");
      return;
    }

    setIsCreating(true);
    try {
      const created = await createCodeReview(projectId);
      const [history, detail] = await Promise.all([
        listCodeReviews(projectId),
        getCodeReview(created.id),
      ]);
      setReviews(history.items);
      setSelectedReview(detail);
      setActiveTask(detail.task ?? created.task);
      setNotice("代码审查已创建，正在生成结果。");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.code === "TASK_ALREADY_ACTIVE") {
        setNotice("已有代码审查任务正在运行，已恢复当前任务。");
        try {
          const history = await listCodeReviews(projectId);
          const running = history.items.find((review) => isActiveReviewStatus(review.status));
          const detail = running ? await getCodeReview(running.id) : null;
          setReviews(history.items);
          setSelectedReview(detail);
          setActiveTask(detail?.task ?? null);
        } catch (recoveryCause) {
          setError(recoveryCause instanceof Error ? recoveryCause.message : "恢复运行中的代码审查失败");
        }
      } else {
        setError(cause instanceof Error ? cause.message : "创建代码审查失败");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSelectReview(reviewId: string) {
    setError("");
    setPollingError("");
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
      <div className="state-panel" role="status">
        <RefreshCw aria-hidden="true" />
        <span>正在加载代码审查...</span>
      </div>
    );
  }

  const createButtonLabel = isCreating
    ? "正在创建..."
    : selectedReview?.status === "FAILED" || selectedReview?.status === "CANCELLED"
      ? "重新生成"
      : reviews.length === 0
        ? "生成代码审查"
        : "新建审查";

  return (
    <section className="app-page">
      <div className="page-heading">
        <div>
          <span>代码审查</span>
          <h1>{project?.name ?? "项目代码审查"}</h1>
          <p>基于已完成的项目分析生成代码审查报告，覆盖可维护性、安全性与性能。</p>
        </div>
        <div className="page-actions">
          <button className="ghost-action" type="button" disabled={isRefreshing} onClick={() => void refreshPage()}>
            {isRefreshing ? <Loader2 aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {isRefreshing ? "刷新中..." : project ? "刷新" : "重试加载"}
          </button>
          <button className="primary-button compact" type="button" disabled={!canCreate} onClick={() => void handleCreateReview()}>
            {isCreating ? <Loader2 aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {createButtonLabel}
          </button>
        </div>
      </div>

      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {pollingError ? <p className="app-banner warning" role="alert">{pollingError}，页面将自动重试。</p> : null}
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

        <ReviewResultPanel
          review={selectedReview}
          task={activeTask}
          projectId={projectId}
          canCreate={canCreate}
          isCreating={isCreating}
          onCreate={handleCreateReview}
        />
      </div>
    </section>
  );
}

interface ReviewResultPanelProps {
  review: CodeReviewDetail | null;
  task: AsyncTask | null;
  projectId: string;
  canCreate: boolean;
  isCreating: boolean;
  onCreate: () => Promise<void>;
}

function ReviewResultPanel({ review, task, projectId, canCreate, isCreating, onCreate }: ReviewResultPanelProps) {
  if (!review) {
    return (
      <div className="review-result empty-panel">
        <FileSearch aria-hidden="true" />
        <h2>还没有代码审查结果</h2>
        <p>项目分析完成后，即可生成第一份代码审查报告。</p>
        <button className="primary-button compact" type="button" disabled={!canCreate} onClick={() => void onCreate()}>
          {isCreating ? <Loader2 aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isCreating ? "正在创建..." : "生成代码审查"}
        </button>
      </div>
    );
  }

  const isRunning = isActiveReviewStatus(review.status);
  const failure = review.failure ?? task?.failure;

  return (
    <div className="review-result">
      <div className="review-summary-panel">
        <div>
          <span>总分</span>
          <strong>{review.score ?? "--"}<small>/100</small></strong>
          <StatusBadge status={review.status} />
        </div>
        <p>{review.summary || statusMessage(review.status)}</p>
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
          <article className="detail-panel review-overview">
            <h2>审查概览</h2>
            <p>{review.result.overview}</p>
          </article>
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
        <div className="state-panel compact" role="status">
          <Loader2 aria-hidden="true" />
          <span>代码审查正在生成，页面会自动刷新结果。</span>
        </div>
      ) : review.status === "FAILED" || review.status === "CANCELLED" ? (
        <div className="state-panel compact">
          <AlertCircle aria-hidden="true" />
          <span>本次代码审查未生成可展示结果。</span>
          <button className="primary-button compact" type="button" disabled={!canCreate} onClick={() => void onCreate()}>
            {isCreating ? <Loader2 aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {isCreating ? "正在创建..." : "重新生成代码审查"}
          </button>
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
      {items.length > 0 ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂无内容</p>}
    </article>
  );
}

function StatusBadge({ status }: { status: CodeReview["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{taskStatusText(status)}</span>;
}

function isActiveReviewStatus(status: CodeReview["status"]): boolean {
  return ACTIVE_REVIEW_STATUSES.has(status);
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
  return map[status];
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
  return map[status];
}

function statusMessage(status: CodeReview["status"]): string {
  if (status === "FAILED") return "代码审查失败，请查看失败原因后重试。";
  if (status === "CANCELLED") return "代码审查已取消。";
  if (isActiveReviewStatus(status)) return "代码审查任务正在运行。";
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
