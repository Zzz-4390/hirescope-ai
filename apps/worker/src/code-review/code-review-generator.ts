import type { CodeReviewResult } from '@hirescope/shared-types';

export interface CodeReviewAnalysisInput {
  summary?: unknown;
  techStack: unknown;
  coreModules: unknown;
  statistics: unknown;
}

export interface CodeReviewGenerationContext {
  userId: string;
  projectId: string;
  taskId: string;
}

export interface GeneratedCodeReview {
  summary: string;
  score: number;
  model: string;
  result: CodeReviewResult;
}

export interface CodeReviewGenerator {
  review(analysis: CodeReviewAnalysisInput, context: CodeReviewGenerationContext): GeneratedCodeReview | Promise<GeneratedCodeReview>;
}
