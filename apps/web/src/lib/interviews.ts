import { apiRequest } from "./api";
import type { AsyncTask } from "./projects";

export type InterviewStatus =
  | "GENERATING"
  | "READY"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REPORT_GENERATING"
  | "COMPLETED"
  | "FAILED";

export type InterviewDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface Interview {
  id: string;
  title: string;
  status: InterviewStatus;
  difficulty: InterviewDifficulty;
  questionCount: number;
  currentIndex: number;
  failure: { code: string; message?: string | null } | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  sequence: number;
  category: string;
  difficulty: InterviewDifficulty;
  question: string;
  answer: {
    content: string;
    answeredAt: string;
    updatedAt: string;
  } | null;
}

export interface InterviewDetail extends Interview {
  answeredCount: number;
  answerProgress: {
    answeredCount: number;
    questionCount: number;
    percentage: number;
  };
  questions?: InterviewQuestion[];
  task: AsyncTask | null;
}

export interface InterviewListResponse {
  items: Interview[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateInterviewInput {
  questionCount: number;
  difficulty: InterviewDifficulty;
}

export interface CreateInterviewResponse extends Interview {
  task: AsyncTask;
}

export interface SavedInterviewAnswer {
  id: string;
  questionId: string;
  content: string;
  answeredAt: string;
  updatedAt: string;
  currentIndex: number;
}

export interface InterviewReportDimensions {
  projectUnderstanding: number;
  technicalAccuracy: number;
  communication: number;
  problemSolving: number;
}

export interface InterviewQuestionReview {
  questionId: string;
  sequence: number;
  score: number;
  comment: string;
  summary?: string;
  coveredPoints?: string[];
  missedPoints?: string[];
  strengths?: string[];
  improvements?: string[];
  improvedAnswerExample?: string;
  matchedReferencePoints: number;
  totalReferencePoints: number;
}

export interface InterviewReport {
  id: string;
  overallScore: number;
  summary: string;
  dimensions: InterviewReportDimensions;
  questionReviews: InterviewQuestionReview[];
  strengths: string[];
  improvements: string[];
  model: string;
  createdAt: string;
}

export interface CreateInterviewReportResponse {
  interview: { id: string; status: "REPORT_GENERATING" | "COMPLETED" };
  task?: AsyncTask;
  report?: InterviewReport;
}

export interface GetInterviewReportResponse {
  status: "REPORT_GENERATING" | "COMPLETED";
  report: InterviewReport | null;
}

export function createInterview(projectId: string, input: CreateInterviewInput): Promise<CreateInterviewResponse> {
  return apiRequest<CreateInterviewResponse>(`/projects/${projectId}/interviews`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listInterviews(projectId: string, page = 1, pageSize = 20): Promise<InterviewListResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest<InterviewListResponse>(`/projects/${projectId}/interviews?${params.toString()}`);
}

export function getInterview(interviewId: string): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${interviewId}`);
}

export function startInterview(interviewId: string): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${interviewId}/start`, { method: "POST" });
}

export function saveInterviewAnswer(interviewId: string, questionId: string, content: string): Promise<SavedInterviewAnswer> {
  return apiRequest<SavedInterviewAnswer>(`/interviews/${interviewId}/answers/${questionId}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function submitInterview(interviewId: string): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${interviewId}/submit`, { method: "POST" });
}

export function createInterviewReport(interviewId: string): Promise<CreateInterviewReportResponse> {
  return apiRequest<CreateInterviewReportResponse>(`/interviews/${interviewId}/report`, { method: "POST" });
}

export function getInterviewReport(interviewId: string): Promise<GetInterviewReportResponse> {
  return apiRequest<GetInterviewReportResponse>(`/interviews/${interviewId}/report`);
}
