import { z } from 'zod';

export const TASK_QUEUE_NAME = 'hirescope-tasks';

export const TaskJobPayloadSchema = z.object({ taskId: z.string().uuid() }).strict();
export type TaskJobPayload = z.infer<typeof TaskJobPayloadSchema>;

export const TechStackItemSchema = z.object({ name: z.string().min(1), category: z.string().min(1), version: z.string().min(1).optional() }).strict();
export const DirectoryEntrySchema = z.object({ path: z.string().min(1), type: z.enum(['file', 'directory']) }).strict();
export const CoreModuleSchema = z.object({ name: z.string().min(1), path: z.string().min(1), description: z.string() }).strict();
export const ProjectStatisticsSchema = z.object({ totalFiles: z.number().int().nonnegative(), totalLines: z.number().int().nonnegative(), languages: z.record(z.string(), z.number().int().nonnegative()) }).strict();
export const ProjectAnalysisResultSchema = z.object({
  summary: z.string(),
  techStack: z.array(TechStackItemSchema),
  directoryTree: z.array(DirectoryEntrySchema),
  coreModules: z.array(CoreModuleSchema),
  entryFiles: z.array(z.string()),
  statistics: ProjectStatisticsSchema,
  analyzerVersion: z.string().min(1),
}).strict();
export type ProjectAnalysisResult = z.infer<typeof ProjectAnalysisResultSchema>;

const ReviewDimensionSchema = z.object({ score: z.number().int().min(0).max(100), summary: z.string().min(1) }).strict();
export const CodeReviewResultSchema = z.object({
  overview: z.string().min(1),
  strengths: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  suggestions: z.array(z.string().min(1)),
  maintainability: ReviewDimensionSchema,
  security: ReviewDimensionSchema,
  performance: ReviewDimensionSchema,
}).strict();
export type CodeReviewResult = z.infer<typeof CodeReviewResultSchema>;

export const InterviewQuestionSchema = z.object({
  sequence: z.number().int().positive(),
  category: z.string().min(1).max(100),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  question: z.string().min(1),
  referencePoints: z.array(z.string().min(1)),
  evidencePaths: z.array(z.string().min(1)).min(1).max(5),
}).strict();
export const InterviewQuestionsResultSchema = z.object({ questions: z.array(InterviewQuestionSchema).min(1) }).strict();
export type InterviewQuestionsResult = z.infer<typeof InterviewQuestionsResultSchema>;

const InterviewReportScoreSchema = z.number().int().min(0).max(100);
export const InterviewRubricPointSchema = z.object({
  point: z.string().min(1),
  weight: z.number().int().positive().max(100),
  score: InterviewReportScoreSchema,
  matched: z.boolean(),
  evidence: z.array(z.string().min(1)),
}).strict().refine((point) => point.score <= point.weight, { message: 'rubric point score cannot exceed weight' });
export const InterviewReportDimensionsSchema = z.object({
  projectUnderstanding: InterviewReportScoreSchema,
  technicalAccuracy: InterviewReportScoreSchema,
  communication: InterviewReportScoreSchema,
  problemSolving: InterviewReportScoreSchema,
}).strict();
export const InterviewQuestionReviewSchema = z.object({
  questionId: z.string().min(1),
  sequence: z.number().int().positive(),
  score: InterviewReportScoreSchema,
  comment: z.string().min(1),
  summary: z.string().min(1),
  coveredPoints: z.array(z.string().min(1)),
  missedPoints: z.array(z.string().min(1)),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  improvedAnswerExample: z.string().min(1),
  matchedReferencePoints: z.number().int().nonnegative(),
  totalReferencePoints: z.number().int().nonnegative(),
  // Optional for previously persisted v1 reports; all newly generated reports include both fields.
  rubric: z.array(InterviewRubricPointSchema).min(1).optional(),
  answerEvidence: z.array(z.string().min(1)).optional(),
}).strict()
  .refine((review) => review.matchedReferencePoints <= review.totalReferencePoints, { message: 'matchedReferencePoints cannot exceed totalReferencePoints' })
  .refine((review) => !review.rubric || review.rubric.reduce((total, point) => total + point.weight, 0) === 100, { message: 'rubric weights must total 100' })
  .refine((review) => !review.rubric || review.rubric.reduce((total, point) => total + point.score, 0) === review.score, { message: 'question score must equal rubric total' })
  .refine((review) => !review.rubric || review.rubric.every((point) => point.matched === (point.evidence.length > 0)), { message: 'rubric evidence must match state' });
export const InterviewReportResultSchema = z.object({
  overallScore: InterviewReportScoreSchema,
  summary: z.string().min(1),
  dimensions: InterviewReportDimensionsSchema,
  questionReviews: z.array(InterviewQuestionReviewSchema).min(1),
  strengths: z.array(z.string().min(1)).min(1),
  improvements: z.array(z.string().min(1)).min(1),
  model: z.literal('deterministic-interview-report-v1'),
}).strict();
export type InterviewReportResult = z.infer<typeof InterviewReportResultSchema>;

export interface ExtractionLimits {
  zipMaxBytes: number;
  maxFiles: number;
  maxSingleFileBytes: number;
  maxExtractedBytes: number;
  maxDepth: number;
  maxTextReadBytes: number;
}

const MIB = 1024 * 1024;
export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = Object.freeze({ zipMaxBytes: 50 * MIB, maxFiles: 5000, maxSingleFileBytes: 2 * MIB, maxExtractedBytes: 200 * MIB, maxDepth: 30, maxTextReadBytes: MIB });

function positiveInteger(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
}

export function extractionLimitsFromEnv(env: Record<string, string | undefined>): ExtractionLimits {
  return {
    zipMaxBytes: positiveInteger(env, 'ZIP_MAX_BYTES', DEFAULT_EXTRACTION_LIMITS.zipMaxBytes),
    maxFiles: positiveInteger(env, 'ZIP_MAX_FILES', DEFAULT_EXTRACTION_LIMITS.maxFiles),
    maxSingleFileBytes: positiveInteger(env, 'ZIP_MAX_SINGLE_FILE_BYTES', DEFAULT_EXTRACTION_LIMITS.maxSingleFileBytes),
    maxExtractedBytes: positiveInteger(env, 'ZIP_MAX_EXTRACTED_BYTES', DEFAULT_EXTRACTION_LIMITS.maxExtractedBytes),
    maxDepth: positiveInteger(env, 'ZIP_MAX_DEPTH', DEFAULT_EXTRACTION_LIMITS.maxDepth),
    maxTextReadBytes: positiveInteger(env, 'ANALYSIS_MAX_TEXT_READ_BYTES', DEFAULT_EXTRACTION_LIMITS.maxTextReadBytes),
  };
}
