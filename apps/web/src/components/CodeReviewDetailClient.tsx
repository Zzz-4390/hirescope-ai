"use client";

import { AlertCircle, ArrowLeft, Clock3, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { type Project, getProject } from "../lib/projects";
import { type CodeReviewDetail, type CodeReviewResult, getCodeReview } from "../lib/reviews";

interface CodeReviewDetailClientProps {
  codeReviewId: string;
  projectId: string;
}

interface ReviewDimensionEntry {
  key: string;
  label: string;
  score: number;
  summary: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  maintainability: "可维护性",
  security: "安全性",
  performance: "性能",
  codeQuality: "代码质量",
  reliability: "可靠性",
};

export function CodeReviewDetailClient({ codeReviewId, projectId }: CodeReviewDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [review, setReview] = useState<CodeReviewDetail | null>(null);
  const invalidMessage = !codeReviewId ? "未获取到有效的审查记录。" : !projectId ? "缺少项目上下文，无法加载审查结果。" : "";
  const [isLoading, setIsLoading] = useState(!invalidMessage);
  const [error, setError] = useState("");
  const returnHref = projectId ? `/app/projects/${encodeURIComponent(projectId)}/review` : "/app/projects";

  useEffect(() => {
    if (invalidMessage) return;

    let active = true;
    Promise.all([getCodeReview(codeReviewId), getProject(projectId)])
      .then(([detail, currentProject]) => {
        if (!active) return;
        setReview(detail);
        setProject(currentProject);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "代码审查结果加载失败");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [codeReviewId, invalidMessage, projectId]);

  if (isLoading) {
    return <div className="state-panel review-detail-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" /><span>正在加载审查结果...</span></div>;
  }

  if (invalidMessage || error || !review) {
    return <DetailState icon="error" title="无法加载审查结果" description={invalidMessage || error || "审查记录不存在或不可访问。"} returnHref={returnHref} />;
  }

  if (isActiveStatus(review.status)) {
    return <DetailState icon="loading" title="审查正在生成，请稍候" description="当前审查尚未生成可查看的诊断结果。" returnHref={returnHref} />;
  }

  if (review.status === "FAILED" || review.status === "CANCELLED") {
    return <DetailState icon="error" title="审查任务执行失败" description={review.failure?.message || "本次审查没有生成可查看的结果。"} returnHref={returnHref} />;
  }

  if (!review.result) {
    return <DetailState icon="error" title="未识别到可审查的源代码" description="请检查项目中是否包含受支持的源码文件，或重新上传包含完整源代码的项目。" returnHref={returnHref} />;
  }

  const dimensions = extractDimensions(review.result);
  const hasScore = typeof review.score === "number" && Number.isFinite(review.score);

  return (
    <section className="app-page code-review-detail-page">
      <nav className="review-breadcrumb" aria-label="面包屑">
        <span>项目</span><span aria-hidden="true">/</span>
        <Link href={`/app/projects/${encodeURIComponent(projectId)}`}>{project?.name || "当前项目"}</Link>
        <span aria-hidden="true">/</span><Link href={returnHref}>代码审查</Link>
        <span aria-hidden="true">/</span><span aria-current="page">审查结果</span>
      </nav>
      <Link className="review-detail-back" href={returnHref}><ArrowLeft aria-hidden="true" />返回代码审查页</Link>

      <header className="review-detail-heading">
        <div><h1>代码审查结果</h1><p>{review.summary || "暂无审查摘要"}</p></div>
        <div className="review-detail-score"><span>综合评分</span><strong>{hasScore ? review.score : "—"}{hasScore ? <small>/100</small> : null}</strong>{hasScore ? <StatusBadge status={review.status} /> : <em>无法生成有效评分</em>}</div>
      </header>

      <dl className="review-detail-meta">
        <div><dt>审查时间</dt><dd>{formatDate(review.completedAt || review.createdAt)}</dd></div>
        <div><dt>任务状态</dt><dd><StatusBadge status={review.status} /></dd></div>
        <div><dt>使用模型</dt><dd>{review.model || "未记录"}</dd></div>
        <div><dt>审查记录 ID</dt><dd title={review.id}>{review.id}</dd></div>
      </dl>

      <section className="review-detail-section">
        <h2>审查概览</h2>
        <p className="review-detail-overview">{review.result.overview || "暂无审查概览"}</p>
      </section>

      <section className="review-detail-section">
        <h2>维度结果</h2>
        {dimensions.length > 0 ? <div className="review-detail-dimensions">{dimensions.map((dimension) => <DimensionRow key={dimension.key} dimension={dimension} />)}</div> : <p className="review-detail-empty">暂无可展示的维度结果。</p>}
      </section>

      <section className="review-detail-section review-detail-diagnostics">
        <h2>诊断详情</h2>
        <DiagnosticList title="优点" items={review.result.strengths} tone="success" />
        <DiagnosticList title="主要风险" items={review.result.risks} tone="danger" />
        <DiagnosticList title="改进建议" items={review.result.suggestions} tone="info" />
      </section>
    </section>
  );
}

function DetailState({ icon, title, description, returnHref }: { icon: "loading" | "error"; title: string; description: string; returnHref: string }) {
  return <div className="review-detail-state"><div className="state-panel"><span className="review-detail-state-icon">{icon === "loading" ? <Clock3 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}</span><h1>{title}</h1><p>{description}</p><Link className="ghost-action" href={returnHref}><ArrowLeft aria-hidden="true" />返回代码审查页</Link></div></div>;
}

function DimensionRow({ dimension }: { dimension: ReviewDimensionEntry }) {
  return <article><div><strong>{dimension.label}</strong><span>{dimension.summary || "暂无维度说明"}</span></div><b>{dimension.score}<small>/100</small></b><i><em style={{ width: `${Math.min(100, Math.max(0, dimension.score))}%` }} /></i></article>;
}

function DiagnosticList({ title, items, tone }: { title: string; items: string[] | undefined; tone: "success" | "danger" | "info" }) {
  const validItems = Array.isArray(items) ? items.filter((item) => typeof item === "string" && item.trim()) : [];
  return <section className={`review-detail-list ${tone}`}><h3>{title}</h3>{validItems.length > 0 ? <ul>{validItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂无内容</p>}</section>;
}

function extractDimensions(result: CodeReviewResult): ReviewDimensionEntry[] {
  return Object.entries(result as unknown as Record<string, unknown>).flatMap(([key, value]) => {
    if (!isDimension(value)) return [];
    return [{ key, label: DIMENSION_LABELS[key] || formatDimensionName(key), score: value.score, summary: typeof value.summary === "string" ? value.summary : "" }];
  });
}

function isDimension(value: unknown): value is { score: number; summary?: string } {
  if (!value || typeof value !== "object") return false;
  const score = (value as { score?: unknown }).score;
  return typeof score === "number" && Number.isFinite(score);
}

function formatDimensionName(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function StatusBadge({ status }: { status: CodeReviewDetail["status"] }) {
  const labels: Record<CodeReviewDetail["status"], string> = { PENDING: "等待处理", QUEUED: "排队中", PROCESSING: "处理中", SUCCEEDED: "已完成", FAILED: "失败", CANCELLED: "已取消" };
  return <span className={`status-badge ${status.toLowerCase()}`}>{labels[status]}</span>;
}

function isActiveStatus(status: CodeReviewDetail["status"]): boolean {
  return status === "PENDING" || status === "QUEUED" || status === "PROCESSING";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
