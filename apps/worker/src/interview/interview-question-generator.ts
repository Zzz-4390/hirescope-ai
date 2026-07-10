import type { InterviewQuestionsResult } from '@hirescope/shared-types';
import type { InterviewDifficulty } from '@prisma/client';

export interface InterviewAnalysisInput {
  summary?: unknown;
  techStack: unknown;
  coreModules: unknown;
  statistics: unknown;
}

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
  ): InterviewQuestionsResult | Promise<InterviewQuestionsResult>;
}
