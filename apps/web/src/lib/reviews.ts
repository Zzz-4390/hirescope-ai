import { apiRequest } from "./api";
import type { AsyncTask, TaskStatus } from "./projects";

export interface ReviewDimension {
  score: number;
  summary: string;
}

export interface CodeReviewResult {
  overview: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
  maintainability: ReviewDimension;
  security: ReviewDimension;
  performance: ReviewDimension;
}

export interface CodeReview {
  id: string;
  status: TaskStatus;
  summary: string | null;
  score: number | null;
  model: string | null;
  failure: { code: string; message?: string | null } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CodeReviewDetail extends CodeReview {
  result: CodeReviewResult | null;
  task: AsyncTask | null;
}

export interface CodeReviewListResponse {
  items: CodeReview[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateCodeReviewResponse extends CodeReview {
  task: AsyncTask;
}

export function createCodeReview(projectId: string): Promise<CreateCodeReviewResponse> {
  return apiRequest<CreateCodeReviewResponse>(`/projects/${projectId}/code-reviews`, {
    method: "POST",
  });
}

export function listCodeReviews(projectId: string, page = 1, pageSize = 20): Promise<CodeReviewListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<CodeReviewListResponse>(`/projects/${projectId}/code-reviews?${params.toString()}`);
}

export function getCodeReview(codeReviewId: string): Promise<CodeReviewDetail> {
  return apiRequest<CodeReviewDetail>(`/code-reviews/${codeReviewId}`);
}
