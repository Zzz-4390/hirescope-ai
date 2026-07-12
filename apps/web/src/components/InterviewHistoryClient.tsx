"use client";

import { AlertCircle, Clock3, FileText, Loader2, MessageSquareText, Minus, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type Interview,
  type InterviewDifficulty,
  createInterview,
  getInterview,
  listInterviews,
} from "../lib/interviews";
import { type Project, getProject, getTask, isTerminalTaskStatus } from "../lib/projects";

interface InterviewHistoryClientProps {
  projectId: string;
}

export function InterviewHistoryClient({ projectId }: InterviewHistoryClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>("MEDIUM");
  const [questionCount, setQuestionCount] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const generatingInterview = useMemo(
    () => interviews.find((interview) => interview.status === "GENERATING"),
    [interviews],
  );
  const generatingInterviewId = generatingInterview?.id;
  const canCreate = project?.status === "COMPLETED" && !generatingInterview && !isCreating;
  const isRefreshNeeded = Boolean(generatingInterview);

  useEffect(() => {
    let active = true;

    Promise.all([getProject(projectId), listInterviews(projectId)])
      .then(([currentProject, history]) => {
        if (!active) return;
        setProject(currentProject);
        setInterviews(history.items);
      })
      .catch((cause) => {
        if (active) setError(messageOf(cause, "模拟面试页面加载失败"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!generatingInterviewId) return;
    const currentInterviewId = generatingInterviewId;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const detail = await getInterview(currentInterviewId);
        if (!active) return;
        if (detail.task) {
          const task = await getTask(detail.task.id);
          if (!active) return;
          if (!isTerminalTaskStatus(task.status)) {
            timer = setTimeout(() => void poll(), 2500);
            return;
          }
        } else if (detail.status === "GENERATING") {
          timer = setTimeout(() => void poll(), 2500);
          return;
        }
        const history = await listInterviews(projectId);
        if (active) setInterviews(history.items);
      } catch (cause) {
        if (active) setError(messageOf(cause, "题目生成状态刷新失败"));
      }
    }

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [generatingInterviewId, projectId]);

  async function refresh() {
    setError("");
    setNotice("");
    try {
      const [currentProject, history] = await Promise.all([getProject(projectId), listInterviews(projectId)]);
      setProject(currentProject);
      setInterviews(history.items);
    } catch (cause) {
      setError(messageOf(cause, "模拟面试状态刷新失败"));
    }
  }

  async function handleCreate() {
    setError("");
    setNotice("");
    if (project?.status !== "COMPLETED") {
      setNotice("项目分析完成后才能创建模拟面试。");
      return;
    }

    setIsCreating(true);
    try {
      await createInterview(projectId, { difficulty, questionCount });
      const history = await listInterviews(projectId);
      setInterviews(history.items);
      setNotice("面试题正在生成，页面会自动刷新状态。");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setNotice(cause.code === "TASK_ALREADY_ACTIVE" ? "已有面试题生成任务正在运行，已恢复当前任务。" : cause.message);
        const history = await listInterviews(projectId);
        setInterviews(history.items);
      } else {
        setError(messageOf(cause, "创建模拟面试失败"));
      }
    } finally {
      setIsCreating(false);
    }
  }

  if (isLoading) {
    return <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载模拟面试...</span></div>;
  }

  return (
    <section className="app-page interview-history-page">
      <div className="page-heading interview-page-heading">
        <div>
          <nav className="interview-breadcrumb" aria-label="面包屑">
            <Link href="/app/projects">项目</Link><span>/</span>
            <Link href={`/app/projects/${projectId}`}>{project?.name ?? "当前项目"}</Link><span>/</span>
            <strong>模拟面试</strong>
          </nav>
          {project?.status === "COMPLETED" ? <span className="interview-analysis-status">项目分析已完成</span> : null}
          <h1>模拟面试</h1>
          <p>根据项目分析生成确定性面试题，完成作答后生成能力报告。</p>
        </div>
        {isRefreshNeeded ? <button className="ghost-action" type="button" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" />刷新进度
          </button> : null}
      </div>

      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {notice ? <p className="app-banner info" role="status">{notice}</p> : null}
      {project?.status !== "COMPLETED" ? (
        <p className="app-banner warning" role="status">当前项目状态为 {projectStatusText(project?.status)}，项目分析完成后才能创建面试。</p>
      ) : null}

      <div className="interview-create-panel">
        <div>
          <h2>创建模拟面试</h2>
          <p>选择难度和题目数量，系统将异步生成与项目相关的问题。</p>
        </div>
        <label>难度
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as InterviewDifficulty)}>
            <option value="EASY">简单</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">困难</option>
          </select>
        </label>
        <label>题目数量
          <span className="question-stepper" role="group" aria-label="题目数量">
            <button type="button" aria-label="减少题目数量" disabled={questionCount <= 5} onClick={() => setQuestionCount((count) => Math.max(5, count - 1))}><Minus aria-hidden="true" /></button>
            <output aria-live="polite">{questionCount}</output>
            <button type="button" aria-label="增加题目数量" disabled={questionCount >= 15} onClick={() => setQuestionCount((count) => Math.min(15, count + 1))}><Plus aria-hidden="true" /></button>
          </span>
        </label>
        <button className="primary-button compact" type="button" disabled={!canCreate || questionCount < 5 || questionCount > 15} onClick={() => void handleCreate()}>
          {isCreating ? <Loader2 aria-hidden="true" /> : <Plus aria-hidden="true" />}创建面试
        </button>
      </div>

      <div className="interview-history-panel">
        <div className="panel-title"><h2>面试历史</h2><span>{interviews.length} 条</span></div>
        {interviews.length === 0 ? (
          <div className="interview-empty-state">
            <div className="interview-empty-illustration" aria-hidden="true">
              <FileText />
              <span><MessageSquareText /></span>
            </div>
            <h2>暂无模拟面试记录</h2>
            <p>创建后可继续答题并生成能力报告。</p>
          </div>
        ) : (
          <div className="interview-history-list">
            {interviews.map((interview) => <InterviewHistoryItem key={interview.id} interview={interview} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function InterviewHistoryItem({ interview }: { interview: Interview }) {
  const destination = interview.status === "COMPLETED" || interview.status === "REPORT_GENERATING" || interview.status === "SUBMITTED"
    ? `/app/interviews/${interview.id}/report`
    : `/app/interviews/${interview.id}`;
  const disabled = interview.status === "GENERATING" || interview.status === "FAILED";

  return (
    <article>
      <div className="interview-history-icon">
        {interview.status === "GENERATING" ? <Loader2 aria-hidden="true" /> : interview.status === "FAILED" ? <AlertCircle aria-hidden="true" /> : <MessageSquareText aria-hidden="true" />}
      </div>
      <div>
        <strong>{interview.title}</strong>
        <span>{difficultyText(interview.difficulty)} · {interview.questionCount} 题 · {formatDate(interview.createdAt)}</span>
        {interview.failure ? <small>{interview.failure.message || interview.failure.code}</small> : null}
      </div>
      <InterviewStatusBadge status={interview.status} />
      {disabled ? <span className="history-action muted"><Clock3 aria-hidden="true" />{interview.status === "GENERATING" ? "生成中" : "不可进入"}</span> : <Link className="history-action" href={destination}>{actionText(interview.status)}</Link>}
    </article>
  );
}

export function InterviewStatusBadge({ status }: { status: Interview["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{statusText(status)}</span>;
}

function actionText(status: Interview["status"]) {
  if (status === "READY") return "开始面试";
  if (status === "IN_PROGRESS") return "继续作答";
  return "查看报告";
}

function statusText(status: Interview["status"]) {
  const labels: Record<Interview["status"], string> = {
    GENERATING: "生成题目中", READY: "待开始", IN_PROGRESS: "作答中", SUBMITTED: "已提交",
    REPORT_GENERATING: "生成报告中", COMPLETED: "已完成", FAILED: "失败",
  };
  return labels[status];
}

function difficultyText(difficulty: InterviewDifficulty) {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[difficulty];
}

function projectStatusText(status?: Project["status"]) {
  if (!status) return "未知";
  return { UPLOADED: "已上传", QUEUED: "排队中", ANALYZING: "分析中", COMPLETED: "已完成", FAILED: "失败", DELETING: "删除中", DELETED: "已删除" }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
