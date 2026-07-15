import type { InterviewQuestionsResult } from '@hirescope/shared-types';
import type { InterviewDifficulty } from '@prisma/client';
import type { CodeReviewEvidenceContext } from '../code-review/code-review-generator';

export interface InterviewAnalysisInput {
  summary?: unknown;
  techStack: unknown;
  directoryTree?: unknown;
  coreModules: unknown;
  entryFiles?: unknown;
  statistics: unknown;
}

export type InterviewQuestionEvidenceContext = CodeReviewEvidenceContext;

export interface InterviewQuestionGenerationContext {
  userId: string;
  projectId: string;
  taskId: string;
}

export interface InterviewQuestionGenerator {
  generate(
    analysis: InterviewAnalysisInput,
    latestReview: unknown,
    questionCount: number,
    difficulty: InterviewDifficulty,
    context: InterviewQuestionGenerationContext,
    evidence?: InterviewQuestionEvidenceContext,
  ): InterviewQuestionsResult | Promise<InterviewQuestionsResult>;
}
