import type { CodeReviewResult } from '@hirescope/shared-types';

export interface CodeReviewAnalysisInput {
  summary?: unknown;
  techStack: unknown;
  directoryTree?: unknown;
  coreModules: unknown;
  entryFiles?: unknown;
  statistics: unknown;
}

export interface CodeReviewEvidenceSnippet {
  path: string;
  content: string;
  truncated: boolean;
}

export interface CodeReviewEvidenceContext {
  techStack: unknown;
  directoryTree: Array<{ path: string; type: 'file' | 'directory' }>;
  testFiles: string[];
  entryFiles: string[];
  coreModules: unknown[];
  configFiles: string[];
  snippets: CodeReviewEvidenceSnippet[];
  evidencePaths: string[];
  budget: {
    maxFileChars: number;
    maxSnippetChars: number;
    maxContextChars: number;
    usedSnippetChars: number;
    usedContextChars: number;
  };
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
  review(analysis: CodeReviewAnalysisInput, context: CodeReviewGenerationContext, evidence?: CodeReviewEvidenceContext): GeneratedCodeReview | Promise<GeneratedCodeReview>;
}
