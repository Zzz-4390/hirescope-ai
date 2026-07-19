"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type InterviewDetail,
  INTERVIEW_ANSWER_MAX_LENGTH,
  getInterview,
  saveInterviewAnswer,
  startInterview,
  submitInterview,
} from "../lib/interviews";
import { findInterviewProject } from "../lib/project-collections";
import { getTask, isTerminalTaskStatus, type Project } from "../lib/projects";

interface InterviewSessionClientProps {
  interviewId: string;
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function InterviewSessionClient({ interviewId }: InterviewSessionClientProps) {
  const router = useRouter();
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const answersRef = useRef<Record<string, string>>({});
  const savedAnswersRef = useRef<Record<string, string>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewStatus = interview?.status;
  const questionTaskId = interview?.task?.id;

  const hydrate = useCallback((detail: InterviewDetail) => {
    const hydrated = Object.fromEntries((detail.questions ?? []).map((question) => [question.id, question.answer?.content ?? ""]));
    const savedTimestamps = (detail.questions ?? [])
      .flatMap((question) => question.answer?.updatedAt ? [new Date(question.answer.updatedAt).getTime()] : [])
      .filter(Number.isFinite);
    answersRef.current = hydrated;
    savedAnswersRef.current = hydrated;
    setAnswers(hydrated);
    setInterview(detail);
    setSaveState("idle");
    setLastSavedAt(savedTimestamps.length > 0 ? new Date(Math.max(...savedTimestamps)) : null);
    const firstUnanswered = (detail.questions ?? []).findIndex((question) => !question.answer?.content.trim());
    setActiveIndex(firstUnanswered >= 0 ? firstUnanswered : Math.max(0, Math.min(detail.currentIndex - 1, detail.questionCount - 1)));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      getInterview(interviewId),
      findInterviewProject(interviewId).catch(() => null),
    ])
      .then(([detail, matchedProject]) => {
        if (!active) return;
        setProject(matchedProject);
        hydrate(detail);
      })
      .catch((cause) => {
        if (active) setError(messageOf(cause, "面试加载失败"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hydrate, interviewId]);

  useEffect(() => {
    if (interviewStatus !== "GENERATING") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        if (questionTaskId) {
          const task = await getTask(questionTaskId);
          if (!active) return;
          if (!isTerminalTaskStatus(task.status)) {
            timer = setTimeout(() => void poll(), 2500);
            return;
          }
        }
        const detail = await getInterview(interviewId);
        if (!active) return;
        hydrate(detail);
        if (detail.status === "GENERATING") timer = setTimeout(() => void poll(), 2500);
      } catch (cause) {
        if (active) setError(messageOf(cause, "题目生成状态刷新失败"));
      }
    }

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [hydrate, interviewId, interviewStatus, questionTaskId]);

  async function handleStart() {
    setError("");
    setNotice("");
    setIsStarting(true);
    try {
      hydrate(await startInterview(interviewId));
      setNotice("面试已开始，回答会自动保存。");
    } catch (cause) {
      setError(messageOf(cause, "开始面试失败"));
    } finally {
      setIsStarting(false);
    }
  }

  function handleAnswerChange(questionId: string, content: string) {
    const next = { ...answersRef.current, [questionId]: content };
    answersRef.current = next;
    setAnswers(next);
    setSaveState("pending");
    setError("");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!content.trim()) return;
    saveTimerRef.current = setTimeout(() => void saveQuestion(questionId, content), 700);
  }

  async function saveQuestion(questionId: string, content: string): Promise<boolean> {
    const normalized = content.trim();
    if (!normalized) return true;
    if ((savedAnswersRef.current[questionId] ?? "").trim() === normalized) {
      setSaveState("saved");
      return true;
    }
    setSaveState("saving");
    try {
      const saved = await saveInterviewAnswer(interviewId, questionId, { content: normalized });
      savedAnswersRef.current = { ...savedAnswersRef.current, [questionId]: saved.content };
      if ((answersRef.current[questionId] ?? "").trim() === saved.content) {
        setSaveState("saved");
        setLastSavedAt(new Date());
      }
      setInterview((current) => current ? { ...current, currentIndex: Math.max(current.currentIndex, saved.currentIndex) } : current);
      return true;
    } catch (cause) {
      setSaveState("error");
      setError(messageOf(cause, "答案自动保存失败"));
      return false;
    }
  }

  async function moveTo(index: number) {
    const question = interview?.questions?.[activeIndex];
    if (!question) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const saved = await saveQuestion(question.id, answersRef.current[question.id] ?? "");
    if (saved) setActiveIndex(index);
  }

  async function handleSubmit() {
    if (!interview?.questions) return;
    setError("");
    setNotice("");
    const missing = interview.questions.find((question) => !(answersRef.current[question.id] ?? "").trim());
    if (missing) {
      setActiveIndex(missing.sequence - 1);
      setNotice(`请先完成第 ${missing.sequence} 题后再提交。`);
      return;
    }

    setIsSubmitting(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      for (const question of interview.questions) {
        const saved = await saveQuestion(question.id, answersRef.current[question.id]);
        if (!saved) return;
      }
      await submitInterview(interviewId);
      router.push(`/app/interviews/${interviewId}/report`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "INTERVIEW_NOT_COMPLETE") {
        setNotice("仍有答案尚未成功保存，请确认全部题目保存完成后重试。");
      } else {
        setError(messageOf(cause, "提交面试失败"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载面试...</span></div>;
  if (!interview) return <FailurePanel message={error || "面试不存在"} />;

  const questions = interview.questions ?? [];
  const question = questions[activeIndex];
  const answeredCount = questions.filter((item) => (answers[item.id] ?? "").trim()).length;
  const progress = questions.length > 0 ? Math.round(answeredCount / questions.length * 100) : 0;
  const exitHref = project ? `/app/projects/${project.id}/interviews` : "/app/interviews";

  return (
    <section className="app-page interview-session-page">
      <nav className="session-breadcrumb" aria-label="面包屑">
        <Link href="/app/projects">项目</Link><ChevronRight aria-hidden="true" />
        {project ? <Link href={`/app/projects/${project.id}`}>{project.name}</Link> : <span>项目未找到</span>}
        <ChevronRight aria-hidden="true" /><span aria-current="page">模拟面试</span>
      </nav>
      <div className="session-heading">
        <div>
          <h1>模拟面试</h1>
          <p><strong>{statusText(interview.status)}</strong><span>·</span>{difficultyText(interview.difficulty)}难度<span>·</span>共 {interview.questionCount} 题<span>·</span>已完成 {answeredCount} 题</p>
        </div>
        <Link className="session-exit-button" href={exitHref}><LogOut aria-hidden="true" />退出面试</Link>
      </div>
      {interview.status === "IN_PROGRESS" ? <div className="session-info-strip"><Info aria-hidden="true" />面试进行中，回答将自动保存</div> : null}
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {notice ? <p className="app-banner info" role="status">{notice}</p> : null}

      {interview.status === "GENERATING" ? <WaitingPanel text="面试题正在生成，页面会自动刷新。" /> : null}
      {interview.status === "FAILED" ? <FailurePanel message={interview.failure?.message || interview.failure?.code || "面试题生成失败"} /> : null}
      {interview.status === "READY" ? (
        <div className="interview-ready-panel"><CheckCircle2 aria-hidden="true" /><h2>面试题已准备完成</h2><p>开始后可以逐题作答，输入内容会自动保存。</p><button className="primary-button compact" type="button" disabled={isStarting} onClick={() => void handleStart()}>{isStarting ? <Loader2 aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}开始面试</button></div>
      ) : null}
      {interview.status === "IN_PROGRESS" && question ? (
        <div className="interview-session-layout">
          <aside className="question-navigator" aria-label="答题进度">
            <div className="panel-title"><h2>答题进度</h2><span>{answeredCount} / {questions.length}</span></div>
            <div className="question-index-list">
              {questions.map((item, index) => {
                const isCurrent = index === activeIndex;
                const isAnswered = Boolean((answers[item.id] ?? "").trim());
                const state = isCurrent ? "current" : isAnswered ? "answered" : "unanswered";
                return (
                  <button key={item.id} className={state} type="button" aria-current={isCurrent ? "step" : undefined} aria-label={`第 ${item.sequence} 题，${isCurrent ? "当前题" : isAnswered ? "已完成" : "未作答"}`} onClick={() => void moveTo(index)}>
                    <span className="question-index-number">{isAnswered && !isCurrent ? <Check aria-hidden="true" /> : item.sequence}</span>
                    <span>{isCurrent ? "当前题" : isAnswered ? "已完成" : "未作答"}</span>
                    {isCurrent ? <ChevronRight aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="question-progress-summary">
              <div><span>完成进度</span><strong>{progress}%</strong></div>
              <div className="question-progress-track" role="progressbar" aria-label="面试完成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
            </div>
          </aside>
          <article className="question-workspace">
            <header><span>第 {question.sequence} / {questions.length} 题</span><em>{categoryText(question.category)}</em></header>
            <h2>{question.question}</h2>
            <div className="answer-field">
              <label htmlFor="interview-answer">你的回答</label>
              <div className="answer-textarea-wrap">
                <textarea id="interview-answer" maxLength={INTERVIEW_ANSWER_MAX_LENGTH} value={answers[question.id] ?? ""} onChange={(event) => handleAnswerChange(question.id, event.target.value)} placeholder="请输入你的回答，可结合项目中的实际实现说明。" />
                <span className="answer-character-count" aria-live="polite">{characterCount(answers[question.id] ?? "")} 字</span>
              </div>
            </div>
            <footer>
              <SaveIndicator state={saveState} savedAt={lastSavedAt} onRetry={() => void saveQuestion(question.id, answersRef.current[question.id] ?? "")} />
              <div className="question-actions">
                <button className="session-secondary-button" type="button" disabled={activeIndex === 0 || saveState === "saving"} onClick={() => void moveTo(activeIndex - 1)}><ArrowLeft aria-hidden="true" />上一题</button>
                {activeIndex < questions.length - 1
                  ? <button className="session-primary-button" type="button" disabled={saveState === "saving"} onClick={() => void moveTo(activeIndex + 1)}>下一题<ArrowRight aria-hidden="true" /></button>
                  : <button className="session-primary-button" type="button" disabled={isSubmitting || saveState === "saving"} onClick={() => void handleSubmit()}>{isSubmitting ? <Loader2 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}检查并提交</button>}
              </div>
            </footer>
          </article>
        </div>
      ) : null}
      {interview.status === "SUBMITTED" || interview.status === "REPORT_GENERATING" || interview.status === "COMPLETED" ? (
        <div className="interview-ready-panel"><Clock3 aria-hidden="true" /><h2>{interview.status === "COMPLETED" ? "面试报告已完成" : "面试已提交"}</h2><p>进入报告页面查看或恢复报告生成流程。</p><Link className="primary-button compact" href={`/app/interviews/${interviewId}/report`}>查看面试报告<ArrowRight aria-hidden="true" /></Link></div>
      ) : null}
    </section>
  );
}

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  if (state === "error") {
    return <button className="save-indicator error" type="button" onClick={onRetry}><AlertCircle aria-hidden="true" />保存失败，点击重试</button>;
  }
  const Icon = state === "saving" ? Loader2 : state === "saved" ? CheckCircle2 : state === "pending" ? Clock3 : Save;
  return <div className={`save-indicator ${state}`} role="status"><Icon aria-hidden="true" />{saveStateText(state, savedAt)}{state !== "saving" ? <span>· 自动保存每 0.7 秒</span> : null}</div>;
}

function WaitingPanel({ text }: { text: string }) {
  return <div className="state-panel"><Loader2 aria-hidden="true" /><span>{text}</span></div>;
}

function FailurePanel({ message }: { message: string }) {
  return <div className="empty-panel"><AlertCircle aria-hidden="true" /><h2>当前流程无法继续</h2><p>{message}</p></div>;
}

function saveStateText(state: Exclude<SaveState, "error">, savedAt: Date | null) {
  if (state === "saving") return "正在保存…";
  if (state === "saved") return savedAt ? `已保存 ${formatTime(savedAt)}` : "已保存";
  if (state === "pending") return "等待自动保存";
  return "回答将自动保存";
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function difficultyText(difficulty: InterviewDetail["difficulty"]) {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[difficulty];
}

function statusText(status: InterviewDetail["status"]) {
  return { GENERATING: "生成题目中", READY: "待开始", IN_PROGRESS: "作答中", SUBMITTED: "已提交", REPORT_GENERATING: "生成报告中", COMPLETED: "已完成", FAILED: "失败" }[status];
}

function categoryText(category: string): string {
  const normalized = category.trim();
  if (/[\u3400-\u9fff]/u.test(normalized)) return normalized;
  const key = normalized.toLowerCase().replace(/[\s-]+/g, "_");
  return {
    design: "系统设计",
    system_design: "系统设计",
    backend: "后端开发",
    frontend: "前端开发",
    database: "数据库",
    architecture: "架构设计",
    project: "项目经验",
    project_experience: "项目经验",
    behavioral: "行为面试",
    algorithm: "算法与数据结构",
    devops: "DevOps",
  }[key] ?? "综合能力";
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
