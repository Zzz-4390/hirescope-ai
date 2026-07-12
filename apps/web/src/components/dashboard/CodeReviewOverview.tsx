import { AlertTriangle, ArrowRight, Gauge, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";

import type { CodeReviewDetail } from "../../lib/reviews";
import { ReviewIllustration } from "./DashboardIllustrations";
import styles from "./Dashboard.module.css";

export function CodeReviewOverview({ projectId, review }: { projectId: string; review: CodeReviewDetail | null }) {
  const isProcessing = review ? ["PENDING", "QUEUED", "PROCESSING"].includes(review.status) : false;
  const isFailed = review?.status === "FAILED";
  const score = review?.score;
  const dimensions = [
    { label: "代码质量", score, icon: <Sparkles /> },
    { label: "性能", score: review?.result?.performance.score, icon: <Gauge /> },
    { label: "安全", score: review?.result?.security.score, icon: <ShieldCheck /> },
    { label: "可维护性", score: review?.result?.maintainability.score, icon: <Wrench /> },
  ];
  const risks = review?.result?.risks ?? [];
  return (
    <section className={styles.reviewPanel} id="review">
      <header className={styles.sectionHeader}><div><h2>AI 代码审查</h2><p>{isFailed ? review.failure?.message || "审查任务执行失败" : isProcessing ? "AI 正在评估代码质量、安全风险、性能与可维护性。" : review?.summary || "基于项目分析结果生成真实代码审查。"}</p></div><StatusText processing={isProcessing} failed={isFailed} completed={review?.status === "SUCCEEDED"} /></header>
      <div className={styles.reviewLayout}>
        <div className={styles.scoreColumn}><ScoreRing score={score} processing={isProcessing} /><span>审查进度</span></div>
        <div className={styles.reviewContent}>
          <div className={styles.dimensionRow}>{dimensions.map((item) => <div key={item.label}><span>{item.icon}{item.label}</span><strong>{item.score ?? "--"}<small>/100</small></strong></div>)}</div>
          <div className={styles.issueHeader}><strong>重点问题</strong><span>{risks.length > 0 ? `${risks.length} 项` : "暂无结构化问题"}</span></div>
          <div className={styles.issueList}>{risks.length > 0 ? risks.slice(0, 4).map((risk, index) => <article key={`${risk}-${index}`}><AlertTriangle aria-hidden="true" /><div><strong>{extractLocation(risk)}</strong><p>{risk}</p></div><span>{index === 0 ? "需关注" : "建议"}</span></article>) : <div className={styles.inlineReviewState}>{isProcessing ? "审查完成后显示重点问题" : isFailed ? "修复任务后可重新发起审查" : "尚未生成代码审查"}</div>}</div>
          <Link className={styles.textLink} href={`/app/projects/${projectId}/review`}>{review ? "查看全部审查" : "生成代码审查"}<ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className={styles.reviewArt}><ReviewIllustration /></div>
      </div>
    </section>
  );
}

function StatusText({ processing, failed, completed }: { processing: boolean; failed: boolean; completed: boolean }) { return <span className={`${styles.statusText} ${failed ? styles.statusFailed : completed ? styles.statusDone : ""}`}>{processing ? "进行中" : failed ? "失败" : completed ? "已完成" : "未开始"}</span>; }
function ScoreRing({ score, processing }: { score: number | null | undefined; processing: boolean }) { const value = score ?? (processing ? 35 : 0); return <div className={`${styles.scoreRing} ${processing ? styles.ringProcessing : ""}`} style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{score ?? (processing ? "…" : "--")}</strong>{score != null ? <small>/100</small> : null}</div></div>; }
function extractLocation(risk: string): string { const candidate = risk.split(/[：:]/, 1)[0]; return /[/.\\]/.test(candidate) && candidate.length < 80 ? candidate : "审查摘要"; }
