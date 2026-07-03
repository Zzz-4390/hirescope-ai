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
