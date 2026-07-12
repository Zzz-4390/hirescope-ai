"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Clock3, FileText, Loader2, MinusCircle, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type InterviewDetail,
  type InterviewReport,
  createInterviewReport,
  getInterview,
  getInterviewReport,
} from "../lib/interviews";
import { type AsyncTask, getTask, isTerminalTaskStatus } from "../lib/projects";
import { InterviewStatusBadge } from "./InterviewHistoryClient";

interface InterviewReportClientProps {
  interviewId: string;
}

export function InterviewReportClient({ interviewId }: InterviewReportClientProps) {
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [task, setTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mountedRef = useRef(true);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const detail = await getInterview(interviewId);
        if (!active) return;
        setInterview(detail);
        if (detail.status === "COMPLETED") {
          await loadCompletedReport();
        } else if (detail.status === "REPORT_GENERATING") {
          await resumeReport();
        }
      } catch (cause) {
        if (active) setError(messageOf(cause, "面试报告页面加载失败"));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    async function loadCompletedReport() {
      const response = await getInterviewReport(interviewId);
      if (!active) return;
      setReport(response.report);
      setError("");
    }

    async function resumeReport() {
      try {
        const response = await createInterviewReport(interviewId);
        if (!active) return;
        if (response.report) {
          setReport(response.report);
          setInterview((current) => current ? { ...current, status: "COMPLETED" } : current);
          return;
        }
        if (response.task) {
          setTask(response.task);
          await pollTask(response.task.id);
          return;
        }
        scheduleStatusPoll();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 409) {
          setNotice("已有报告任务正在运行，正在恢复任务状态。");
          scheduleStatusPoll();
          return;
        }
        throw cause;
      }
    }

    async function pollTask(taskId: string) {
      const currentTask = await getTask(taskId);
      if (!active) return;
      setTask(currentTask);
      if (!isTerminalTaskStatus(currentTask.status)) {
        timer = setTimeout(() => void pollTask(taskId).catch(handlePollingError), 2500);
        return;
      }
      const detail = await getInterview(interviewId);
      if (!active) return;
      setInterview(detail);
      if (currentTask.status === "SUCCEEDED") {
        await loadCompletedReport();
      }
    }

    async function pollStatus() {
      const detail = await getInterview(interviewId);
      if (!active) return;
      setInterview(detail);
      if (detail.status === "COMPLETED") {
        await loadCompletedReport();
        return;
      }
      if (detail.status === "FAILED") return;
      scheduleStatusPoll();
    }

    function scheduleStatusPoll() {
      timer = setTimeout(() => void pollStatus().catch(handlePollingError), 2500);
    }

    function handlePollingError(cause: unknown) {
      if (active) setError(messageOf(cause, "报告任务状态刷新失败"));
    }

    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [interviewId]);

  async function handleCreateReport() {
    setError("");
    setNotice("");
    setIsCreating(true);
    try {
      const response = await createInterviewReport(interviewId);
      if (response.report) {
        setReport(response.report);
        setInterview((current) => current ? { ...current, status: "COMPLETED" } : current);
      } else if (response.task) {
        setTask(response.task);
        setInterview((current) => current ? { ...current, status: "REPORT_GENERATING" } : current);
        setNotice("报告正在生成，页面会自动刷新结果。");
        void pollCreatedTask(response.task.id);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setNotice("已有报告生成任务正在运行，正在恢复任务状态。");
        setInterview((current) => current ? { ...current, status: "REPORT_GENERATING" } : current);
        void pollCreatedStatus();
      } else {
        setError(messageOf(cause, "创建面试报告失败"));
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function pollCreatedTask(taskId: string) {
    try {
      const currentTask = await getTask(taskId);
      if (!mountedRef.current) return;
      setTask(currentTask);
      if (!isTerminalTaskStatus(currentTask.status)) {
        actionTimerRef.current = setTimeout(() => void pollCreatedTask(taskId), 2500);
        return;
      }
      const detail = await getInterview(interviewId);
      if (!mountedRef.current) return;
      setInterview(detail);
      if (currentTask.status === "SUCCEEDED") {
        const response = await getInterviewReport(interviewId);
        setReport(response.report);
      }
    } catch (cause) {
      setError(messageOf(cause, "报告任务状态刷新失败"));
    }
  }

  async function pollCreatedStatus() {
    try {
      const detail = await getInterview(interviewId);
      if (!mountedRef.current) return;
      setInterview(detail);
      if (detail.status === "COMPLETED") {
        const response = await getInterviewReport(interviewId);
        if (mountedRef.current) setReport(response.report);
        return;
      }
      if (detail.status === "FAILED") return;
      actionTimerRef.current = setTimeout(() => void pollCreatedStatus(), 2500);
    } catch (cause) {
      if (mountedRef.current) setError(messageOf(cause, "报告任务状态刷新失败"));
    }
  }

  if (isLoading) return <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载面试报告...</span></div>;
  if (!interview) return <FailurePanel message={error || "面试不存在"} />;

  const failure = interview.failure ?? task?.failure;

  return (
    <section className={`app-page interview-report-page${report ? " has-report" : ""}`}>
      {!report ? (
        <div className="page-heading">
          <div><span>面试报告</span><h1>{interview.title}</h1><p>基于全部面试回答生成确定性能力评估。</p></div>
          <InterviewStatusBadge status={interview.status} />
        </div>
      ) : null}
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {notice ? <p className="app-banner info" role="status">{notice}</p> : null}

      {interview.status === "SUBMITTED" && !report ? (
        <div className="interview-ready-panel"><FileText aria-hidden="true" /><h2>回答已提交</h2><p>现在可以生成面试能力报告。</p><button className="primary-button compact" type="button" disabled={isCreating} onClick={() => void handleCreateReport()}>{isCreating ? <Loader2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}生成报告</button></div>
      ) : null}
      {interview.status === "REPORT_GENERATING" && !report ? (
        <div className="report-generating-panel"><Loader2 aria-hidden="true" /><div><h2>报告生成中</h2><p>{task ? `${taskStatusText(task.status)}${typeof task.progress === "number" ? ` · ${task.progress}%` : ""}` : "正在恢复报告任务状态"}</p>{failure ? <small>{failure.message || failure.code}</small> : null}</div></div>
      ) : null}
      {interview.status === "FAILED" ? <FailurePanel message={failure?.message || failure?.code || "报告生成失败"} /> : null}
      {report ? <ReportView interview={interview} report={report} /> : null}
      {interview.status === "READY" || interview.status === "IN_PROGRESS" || interview.status === "GENERATING" ? (
        <div className="interview-ready-panel"><Clock3 aria-hidden="true" /><h2>面试尚未提交</h2><p>完成全部题目并提交后才能生成报告。</p><Link className="primary-button compact" href={`/app/interviews/${interviewId}`}>返回面试</Link></div>
      ) : null}
    </section>
  );
}

function ReportView({ interview, report }: { interview: InterviewDetail; report: InterviewReport }) {
  const dimensions = [
    ["项目理解", report.dimensions.projectUnderstanding],
    ["技术准确性", report.dimensions.technicalAccuracy],
    ["沟通表达", report.dimensions.communication],
    ["问题解决", report.dimensions.problemSolving],
  ] as const;
  const performance = scorePresentation(report.overallScore);
  const PerformanceIcon = performance.Icon;

  return (
    <div className="interview-report-content">
      <ReportTitle interview={interview} />
      <QuestionReviewAccordion interview={interview} report={report} />
      <h2 className="report-dimensions-heading">能力维度</h2>
      <div className={`report-overview-panel score-${performance.tone}`}>
        <div><span>综合得分</span><strong>{report.overallScore}<small>/100</small></strong><CheckCircle2 aria-hidden="true" /></div>
        <div className="report-summary-meta">
          <span className="report-status"><FileText aria-hidden="true" />报告已完成</span>
          <span className={`report-performance ${performance.tone}`}><PerformanceIcon aria-hidden="true" /><span>面试表现</span><strong>{performance.label}</strong></span>
        </div>
        {report.summary.trim() ? <div className="report-ai-summary"><span>AI 总结</span><p>{report.summary}</p></div> : null}
      </div>
      <div className="report-dimension-grid">{dimensions.map(([label, score]) => <article key={label}><span>{label}</span><strong>{score}<small>/100</small></strong><i><b style={{ width: `${score}%` }} /></i></article>)}</div>
      <div className="report-list-grid"><ReportList title="优势" items={report.strengths} tone="success" /><ReportList title="改进建议" items={report.improvements} tone="warning" /></div>
    </div>
  );
}

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" }) {
  return <article className={`detail-panel report-list ${tone}`}><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></article>;
}

function ReportTitle({ interview }: { interview: InterviewDetail }) {
  return (
    <header className="report-title-panel">
      <div><span>模拟面试报告</span><h1>{interview.title}</h1></div>
      <dl className="report-title-meta">
        <div><dt>难度</dt><dd>{difficultyText(interview.difficulty)}</dd></div>
        <div><dt>题目数量</dt><dd>{interview.questionCount} 题</dd></div>
        <div><dt>完成状态</dt><dd>报告已完成</dd></div>
      </dl>
    </header>
  );
}

function QuestionReviewAccordion({ interview, report }: { interview: InterviewDetail; report: InterviewReport }) {
  if (!report.questionReviews.length) return null;

  return (
    <section className="question-review-accordion" aria-labelledby="question-reviews-title">
      <div className="panel-title"><h2 id="question-reviews-title">逐题评价</h2><span>{report.questionReviews.length} 题</span></div>
      <div className="question-review-list">
        {report.questionReviews.map((review) => {
          const question = interview.questions?.find((item) => item.id === review.questionId);
          const questionText = question?.question.trim();
          const answerText = question?.answer?.content.trim();
          const comment = review.comment.trim();

          return (
            <details key={review.questionId}>
              <summary>
                <span className="question-sequence">第 {review.sequence} 题</span>
                {comment ? <span className="question-comment">简评：{review.comment}</span> : null}
                <span className="question-coverage">覆盖 {review.matchedReferencePoints}/{review.totalReferencePoints}</span>
                <strong>{review.score}<small>/100</small></strong>
                <ChevronDown aria-label="展开评价" />
              </summary>
              {questionText || answerText || comment ? (
                <div className="question-review-detail">
                  {questionText ? <ReviewDetailBlock title="题目" content={questionText} /> : null}
                  {answerText ? <ReviewDetailBlock title="用户回答" content={answerText} /> : null}
                  {comment ? <ReviewDetailBlock title="AI 评价" content={review.comment} /> : null}
                </div>
              ) : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function ReviewDetailBlock({ title, content }: { title: string; content: string }) {
  return <section><h3>{title}</h3><p>{content}</p></section>;
}

function scorePresentation(score: number) {
  if (score < 60) return { label: "待提升", tone: "low", Icon: AlertCircle } as const;
  if (score < 80) return { label: "表现良好", tone: "medium", Icon: MinusCircle } as const;
  return { label: "表现优秀", tone: "high", Icon: CheckCircle2 } as const;
}

function difficultyText(difficulty: InterviewDetail["difficulty"]) {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[difficulty];
}

function FailurePanel({ message }: { message: string }) {
  return <div className="empty-panel"><AlertCircle aria-hidden="true" /><h2>报告暂不可用</h2><p>{message}</p></div>;
}

function taskStatusText(status: AsyncTask["status"]) {
  return { PENDING: "等待处理", QUEUED: "排队中", PROCESSING: "生成中", SUCCEEDED: "已完成", FAILED: "生成失败", CANCELLED: "已取消" }[status];
}

function messageOf(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.code === "INTERVIEW_REPORT_NOT_FOUND") return "报告尚未生成";
  return cause instanceof Error ? cause.message : fallback;
}
