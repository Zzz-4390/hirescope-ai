"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Loader2, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type InterviewDetail,
  getInterview,
  saveInterviewAnswer,
  startInterview,
  submitInterview,
} from "../lib/interviews";
import { getTask, isTerminalTaskStatus } from "../lib/projects";
import { InterviewStatusBadge } from "./InterviewHistoryClient";

interface InterviewSessionClientProps {
  interviewId: string;
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function InterviewSessionClient({ interviewId }: InterviewSessionClientProps) {
  const router = useRouter();
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
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
    answersRef.current = hydrated;
    savedAnswersRef.current = hydrated;
    setAnswers(hydrated);
    setInterview(detail);
    const firstUnanswered = (detail.questions ?? []).findIndex((question) => !question.answer?.content.trim());
    setActiveIndex(firstUnanswered >= 0 ? firstUnanswered : Math.max(0, Math.min(detail.currentIndex - 1, detail.questionCount - 1)));
  }, []);

  useEffect(() => {
    let active = true;
    getInterview(interviewId)
      .then((detail) => {
        if (!active) return;
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
      const saved = await saveInterviewAnswer(interviewId, questionId, normalized);
      savedAnswersRef.current = { ...savedAnswersRef.current, [questionId]: saved.content };
      if ((answersRef.current[questionId] ?? "").trim() === saved.content) setSaveState("saved");
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

  return (
    <section className="app-page interview-session-page">
      <div className="page-heading">
        <div><span>模拟面试</span><h1>{interview.title}</h1><p>{difficultyText(interview.difficulty)} · {interview.questionCount} 题</p></div>
        <InterviewStatusBadge status={interview.status} />
      </div>
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      {notice ? <p className="app-banner info" role="status">{notice}</p> : null}

      {interview.status === "GENERATING" ? <WaitingPanel text="面试题正在生成，页面会自动刷新。" /> : null}
      {interview.status === "FAILED" ? <FailurePanel message={interview.failure?.message || interview.failure?.code || "面试题生成失败"} /> : null}
      {interview.status === "READY" ? (
        <div className="interview-ready-panel"><CheckCircle2 aria-hidden="true" /><h2>面试题已准备完成</h2><p>开始后可以逐题作答，输入内容会自动保存。</p><button className="primary-button compact" type="button" disabled={isStarting} onClick={() => void handleStart()}>{isStarting ? <Loader2 aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}开始面试</button></div>
      ) : null}
      {interview.status === "IN_PROGRESS" && question ? (
        <div className="interview-session-layout">
          <aside className="question-navigator">
            <div className="panel-title"><h2>答题进度</h2><span>{answeredCount}/{questions.length}</span></div>
            <div className="question-index-grid">{questions.map((item, index) => <button key={item.id} className={`${index === activeIndex ? "active" : ""} ${(answers[item.id] ?? "").trim() ? "answered" : ""}`} type="button" aria-label={`第 ${item.sequence} 题`} onClick={() => void moveTo(index)}>{(answers[item.id] ?? "").trim() ? <Check aria-hidden="true" /> : item.sequence}</button>)}</div>
          </aside>
          <div className="question-workspace">
            <header><span>第 {question.sequence} / {questions.length} 题</span><em>{question.category}</em></header>
            <h2>{question.question}</h2>
            <label htmlFor="interview-answer">你的回答</label>
            <textarea id="interview-answer" maxLength={5000} value={answers[question.id] ?? ""} onChange={(event) => handleAnswerChange(question.id, event.target.value)} placeholder="结合项目实际实现，说明你的思路、权衡和结果。" />
            <div className={`save-indicator ${saveState}`} role="status"><Save aria-hidden="true" />{saveStateText(saveState)}</div>
            <footer>
              <button className="ghost-action" type="button" disabled={activeIndex === 0 || saveState === "saving"} onClick={() => void moveTo(activeIndex - 1)}><ArrowLeft aria-hidden="true" />上一题</button>
              {activeIndex < questions.length - 1 ? <button className="primary-button compact" type="button" disabled={saveState === "saving"} onClick={() => void moveTo(activeIndex + 1)}>下一题<ArrowRight aria-hidden="true" /></button> : <button className="primary-button compact" type="button" disabled={isSubmitting || saveState === "saving"} onClick={() => void handleSubmit()}>{isSubmitting ? <Loader2 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}提交面试</button>}
            </footer>
          </div>
        </div>
      ) : null}
      {interview.status === "SUBMITTED" || interview.status === "REPORT_GENERATING" || interview.status === "COMPLETED" ? (
        <div className="interview-ready-panel"><Clock3 aria-hidden="true" /><h2>{interview.status === "COMPLETED" ? "面试报告已完成" : "面试已提交"}</h2><p>进入报告页面查看或恢复报告生成流程。</p><Link className="primary-button compact" href={`/app/interviews/${interviewId}/report`}>查看面试报告<ArrowRight aria-hidden="true" /></Link></div>
      ) : null}
    </section>
  );
}

function WaitingPanel({ text }: { text: string }) {
  return <div className="state-panel"><Loader2 aria-hidden="true" /><span>{text}</span></div>;
}

function FailurePanel({ message }: { message: string }) {
  return <div className="empty-panel"><AlertCircle aria-hidden="true" /><h2>当前流程无法继续</h2><p>{message}</p></div>;
}

function saveStateText(state: SaveState) {
  return { idle: "尚未修改", pending: "等待自动保存", saving: "正在保存...", saved: "已自动保存", error: "保存失败，请重试" }[state];
}

function difficultyText(difficulty: InterviewDetail["difficulty"]) {
  return { EASY: "简单", MEDIUM: "中等", HARD: "困难" }[difficulty];
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
