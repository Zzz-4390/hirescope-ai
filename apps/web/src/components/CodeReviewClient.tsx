"use client";

import {
  AlertCircle,
  Braces,
  CheckCircle2,
  Clock3,
  File,
  FileSearch,
  Folder,
  FolderOpen,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import { type AsyncTask, type Project, getProject, getTask } from "../lib/projects";
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

type ReviewViewState = "idle" | "processing" | "completed_valid" | "completed_empty" | "failed";

export function CodeReviewClient({ projectId }: CodeReviewClientProps) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<CodeReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<CodeReviewDetail | null>(null);
  const [activeTask, setActiveTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const viewState = deriveReviewViewState(selectedReview, activeTask, isCreating);
  const selectedReviewId = selectedReview?.id;
  const selectedReviewStatus = selectedReview?.status;
  const selectedReviewTaskId = selectedReview?.task?.id;
  const activeTaskStatus = activeTask?.status;

  useEffect(() => {
    if (!selectedReviewId || viewState !== "processing") return;
    const reviewId = selectedReviewId;
    const taskId = selectedReviewTaskId;

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

        let finalDetail = detail;
        const nextTask = task ?? detail.task;
        const reachedTerminalState = deriveReviewViewState(detail, nextTask) !== "processing";
        if (reachedTerminalState && isActiveReviewStatus(detail.status)) {
          finalDetail = await getCodeReview(reviewId);
          if (cancelled) return;
        }

        setSelectedReview(finalDetail);
        setActiveTask(nextTask ?? finalDetail.task);
        setPollingError("");

        shouldContinue = deriveReviewViewState(finalDetail, nextTask) === "processing";
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
  }, [activeTaskStatus, projectId, selectedReviewId, selectedReviewStatus, selectedReviewTaskId, viewState]);

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

  async function handleOpenReview(reviewId: string) {
    setError("");
    setPollingError("");
    setNotice("");
    const record = reviews.find((review) => review.id === reviewId);
    if (!reviewId || !record) {
      setNotice("未获取到有效的审查记录。");
      return;
    }
    if (isActiveReviewStatus(record.status)) {
      setNotice("审查正在生成，请稍候。");
      return;
    }
    if (record.status === "FAILED" || record.status === "CANCELLED") {
      setNotice("审查任务执行失败，暂无可查看的审查结果。");
      return;
    }
    try {
      const detail = await getCodeReview(reviewId);
      setSelectedReview(detail);
      setActiveTask(detail.task);
      if (!hasValidReviewResult(detail)) {
        setNotice("暂无可查看的审查结果。");
        return;
      }
      router.push(reviewDetailHref(reviewId, projectId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "代码审查结果加载失败");
    }
  }

  if (isLoading) {
    return (
      <div className="state-panel review-loading" role="status">
        <RefreshCw aria-hidden="true" />
        <span>正在加载代码审查...</span>
      </div>
    );
  }

  return (
    <section className="app-page code-review-page">
      <div className="page-heading review-heading">
        <div>
          <nav className="review-breadcrumb" aria-label="面包屑">
            <span>项目</span>
            <span aria-hidden="true">/</span>
            <Link href={`/app/projects/${projectId}`} title={project?.name ?? "当前项目"}>{project?.name ?? "当前项目"}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">代码审查</span>
          </nav>
          <span className={`project-analysis-status ${project?.status === "COMPLETED" ? "completed" : ""}`}>
            {project?.status === "COMPLETED" ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            项目分析{project ? projectStatusText(project.status) : "状态加载中"}
          </span>
          <h1>代码审查</h1>
          <p>基于项目分析结果，系统将为您生成代码审查报告，覆盖可维护性、安全性、性能与工程规范等维度。</p>
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

      <ReviewWorkbench
        review={selectedReview}
        task={activeTask}
        projectId={projectId}
        isCreating={isCreating}
        viewState={viewState}
        canCreate={canCreate}
        onCreate={handleCreateReview}
      />

      <section className="review-records" aria-labelledby="review-records-title">
        <div className="panel-title">
          <h2 id="review-records-title">审查记录</h2>
          <span>{reviews.length} 条</span>
        </div>
        {reviews.length === 0 ? (
          <div className="review-records-empty">
            <FileSearch aria-hidden="true" />
            <div>
              <strong>还没有生成过代码审查</strong>
              <p>第一次审查完成后，这里会保留真实的审查结果。</p>
            </div>
          </div>
        ) : <aside className="review-history" aria-label="审查历史记录">
          <div className="panel-title">
            <h2>历史记录</h2>
          </div>
          <div className="history-list">
            {reviews.map((review) => (
              <button
                key={review.id}
                className={selectedReview?.id === review.id ? "active" : ""}
                type="button"
                onClick={() => void handleOpenReview(review.id)}
              >
                <strong>代码审查</strong>
                <span>
                  <StatusBadge status={review.status} />
                  <small>{formatDate(review.createdAt)}</small>
                </span>
                <span className="history-score">{hasValidScore(review.score) ? `${review.score}/100` : isActiveReviewStatus(review.status) ? "待生成" : "无法评分"}</span>
                <small className="history-summary">{review.summary || historySummary(review.status)}</small>
              </button>
            ))}
          </div>
        </aside>}
      </section>
    </section>
  );
}

interface ReviewWorkbenchProps {
  projectId: string;
  review: CodeReviewDetail | null;
  task: AsyncTask | null;
  isCreating: boolean;
  viewState: ReviewViewState;
  canCreate: boolean;
  onCreate: () => Promise<void>;
}

const REVIEW_DIMENSIONS = [
  { title: "可维护性", icon: Wrench },
  { title: "安全性", icon: ShieldCheck },
  { title: "性能", icon: Gauge },
  { title: "工程规范", icon: Braces },
] as const;

function ReviewWorkbench({ projectId, review, task, isCreating, viewState, canCreate, onCreate }: ReviewWorkbenchProps) {
  const isProcessing = viewState === "processing";
  const isFailed = viewState === "failed";
  const isCompletedValid = viewState === "completed_valid";
  const isCompletedEmpty = viewState === "completed_empty";
  const isScanning = isProcessing && (review?.status === "PROCESSING" || task?.status === "PROCESSING");
  const progress = typeof task?.progress === "number" ? Math.min(100, Math.max(0, task.progress)) : null;
  const stageText = processingStageText(review, task, isCreating);

  return (
    <section className={`review-workbench ${isScanning ? "is-scanning" : ""}`} aria-labelledby="review-workbench-title">
      <h2 id="review-workbench-title">AI 代码诊断工作台</h2>
      <div className="review-workbench-grid">
        <div className="review-launch-panel">
          <h3>启动代码审查</h3>
          <p>AI 将深度分析您的项目结构，发现潜在问题并给出改进建议。</p>
          <div className={`review-primary-state ${viewState}`}>
            {isProcessing ? <Loader2 className="is-spinning" aria-hidden="true" /> : isFailed || isCompletedEmpty ? <AlertCircle aria-hidden="true" /> : isCompletedValid ? <CheckCircle2 aria-hidden="true" /> : <Braces aria-hidden="true" />}
            <div><strong>{workbenchTitle(viewState)}</strong><small>{workbenchDescription(viewState)}</small></div>
          </div>
          {viewState === "idle" ? (
            <button className="primary-button review-start-button" type="button" disabled={!canCreate} onClick={() => void onCreate()}>
              <Play aria-hidden="true" />开始代码审查
            </button>
          ) : null}
          {isCompletedValid && review?.id ? <Link className="primary-button review-start-button" href={reviewDetailHref(review.id, projectId)}>查看审查结果</Link> : null}
          {(isCompletedEmpty || isFailed) && canCreate ? (
            <button className="primary-button review-start-button" type="button" onClick={() => void onCreate()}>
              <RefreshCw aria-hidden="true" />重新生成
            </button>
          ) : null}
          <small className="review-duration"><Clock3 aria-hidden="true" />通常需要 30–90 秒，生成过程中可切换其他页面。</small>
        </div>

        <div className="review-scanner-panel">
          <div className="review-structure" aria-label="抽象项目目录树">
            <span className="scanner-label">项目目录</span>
            <ul>
              <li><FolderOpen aria-hidden="true" /><span>项目根目录</span></li>
              <li className="nested"><Folder aria-hidden="true" /><span>目录</span></li>
              <li className="nested"><Folder aria-hidden="true" /><span>模块</span></li>
              <li className="nested active"><File aria-hidden="true" /><span>文件</span></li>
              <li className="nested"><File aria-hidden="true" /><span>文件</span></li>
            </ul>
          </div>
          <div className="review-code-scan">
            <div className="scan-status">
              {isScanning ? <Loader2 className="is-spinning" aria-hidden="true" /> : isFailed || isCompletedEmpty ? <AlertCircle aria-hidden="true" /> : isCompletedValid ? <CheckCircle2 aria-hidden="true" /> : <Braces aria-hidden="true" />}
              <span>{isProcessing ? `${stageText}${progress !== null ? ` · ${progress}%` : ""}` : isFailed ? "本次扫描已终止" : isCompletedEmpty ? "扫描结束，未识别到有效代码" : isCompletedValid ? "代码扫描已完成" : "准备开始代码审查"}</span>
            </div>
            <div className="abstract-code" aria-label="抽象化代码扫描面板">
              {Array.from({ length: 11 }, (_, index) => (
                <div className="abstract-code-line" key={index}>
                  <span>{index + 1}</span>
                  <i style={{ width: `${42 + ((index * 17) % 48)}%` }}><b /></i>
                </div>
              ))}
              {isScanning ? <div className="scan-line" aria-hidden="true" /> : null}
            </div>
          </div>
        </div>

        <div className="review-dimensions-panel">
          <span className="scanner-label">多维度分析</span>
          <div className="review-dimension-list">
            {REVIEW_DIMENSIONS.map(({ title, icon: Icon }) => (
              <div key={title}>
                <Icon aria-hidden="true" />
                <strong>{title}</strong>
                <small>{isProcessing ? "分析中" : isFailed ? "未完成" : isCompletedValid ? "已完成" : isCompletedEmpty ? "无法评估" : "待分析"}</small>
                {isProcessing ? <Clock3 aria-label="分析中" /> : isFailed ? <AlertCircle aria-label="失败" /> : isCompletedValid ? <CheckCircle2 aria-label="已完成" /> : <span className="dimension-idle" aria-label="待分析" />}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="review-flow" aria-label="代码审查流程">
        <span className="active">项目结构</span><i /><span className={isProcessing ? "active" : ""}>AI 分析引擎</span><i /><span className={isCompletedValid ? "active" : ""}>审查报告</span>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: CodeReview["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{taskStatusText(status)}</span>;
}

function isActiveReviewStatus(status: CodeReview["status"]): boolean {
  return ACTIVE_REVIEW_STATUSES.has(status);
}

function hasValidScore(score: number | null): score is number {
  return typeof score === "number" && Number.isFinite(score);
}

function hasValidReviewResult(review: Pick<CodeReviewDetail, "result">): boolean {
  return review.result !== null;
}

function deriveReviewViewState(review: CodeReviewDetail | null, task: AsyncTask | null, isCreating = false): ReviewViewState {
  if (isCreating) return "processing";
  if (!review) return "idle";
  if (review.status === "FAILED" || review.status === "CANCELLED" || task?.status === "FAILED" || task?.status === "CANCELLED") return "failed";
  if (review.status === "SUCCEEDED" || task?.status === "SUCCEEDED") return hasValidReviewResult(review) ? "completed_valid" : "completed_empty";
  return "processing";
}

function processingStageText(review: CodeReviewDetail | null, task: AsyncTask | null, isCreating: boolean): string {
  if (isCreating) return "正在创建审查任务";
  if (review?.status === "PROCESSING" || task?.status === "PROCESSING") return "正在扫描代码文件";
  return "等待任务开始";
}

function workbenchTitle(state: ReviewViewState): string {
  if (state === "processing") return "代码审查进行中";
  if (state === "completed_valid") return "代码审查已完成";
  if (state === "completed_empty") return "无法生成有效评分";
  if (state === "failed") return "代码审查未完成";
  return "准备开始代码审查";
}

function workbenchDescription(state: ReviewViewState): string {
  if (state === "processing") return "请稍候，系统正在处理真实项目内容";
  if (state === "completed_valid") return "审查结果已生成，可查看完整诊断";
  if (state === "completed_empty") return "任务已结束，但未识别到可审查的有效代码";
  if (state === "failed") return "请查看失败原因后重新执行";
  return "确认项目内容后即可启动分析";
}

function historySummary(status: CodeReview["status"]): string {
  if (status === "FAILED") return "任务执行失败，请在详情中查看原因";
  if (status === "CANCELLED") return "任务已取消";
  if (isActiveReviewStatus(status)) return "正在生成审查结果";
  return "任务已结束，未生成有效摘要";
}

function reviewDetailHref(codeReviewId: string, projectId: string): string {
  return `/app/code-reviews/${encodeURIComponent(codeReviewId)}?projectId=${encodeURIComponent(projectId)}`;
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
