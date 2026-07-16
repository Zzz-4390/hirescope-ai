import type { CodeReviewEvidenceContext } from '../code-review/code-review-generator';

export const AI_EVIDENCE_PROMPT_LIMITS = Object.freeze({
  maxTotalChars: 64_000,
  maxProjectSummaryChars: 4_000,
  maxLatestReviewChars: 6_000,
});

interface EvidencePromptInput {
  systemPrompt: string;
  task: string;
  projectSummary: unknown;
  reviewContext: CodeReviewEvidenceContext;
  latestCodeReview?: unknown;
}

export function buildEvidencePrompts(input: EvidencePromptInput): { systemPrompt: string; userPrompt: string } {
  const maxUserChars = AI_EVIDENCE_PROMPT_LIMITS.maxTotalChars - input.systemPrompt.length;
  if (maxUserChars < 1_000) throw new Error('AI_PROMPT_SYSTEM_TOO_LARGE');

  const payload: Record<string, unknown> = {
    task: input.task,
    projectSummary: boundedValue(input.projectSummary, AI_EVIDENCE_PROMPT_LIMITS.maxProjectSummaryChars),
    reviewContext: cloneContext(input.reviewContext),
  };
  if (input.latestCodeReview !== undefined) {
    payload.latestCodeReview = boundedValue(input.latestCodeReview, AI_EVIDENCE_PROMPT_LIMITS.maxLatestReviewChars);
  }

  let userPrompt = JSON.stringify(payload);
  while (userPrompt.length > maxUserChars && shrinkPayload(payload)) userPrompt = JSON.stringify(payload);
  if (userPrompt.length > maxUserChars) throw new Error('AI_PROMPT_BUDGET_EXCEEDED');
  return { systemPrompt: input.systemPrompt, userPrompt };
}

function cloneContext(context: CodeReviewEvidenceContext): CodeReviewEvidenceContext {
  return {
    techStack: cloneJson(context.techStack),
    directoryTree: context.directoryTree.map((entry) => ({ ...entry })),
    testFiles: [...context.testFiles],
    entryFiles: [...context.entryFiles],
    coreModules: context.coreModules.map(cloneJson),
    configFiles: [...context.configFiles],
    snippets: context.snippets.map((snippet) => ({ ...snippet })),
    evidencePaths: [...context.evidencePaths],
    budget: { ...context.budget },
  };
}

function shrinkPayload(payload: Record<string, unknown>): boolean {
  const context = payload.reviewContext as CodeReviewEvidenceContext;
  if (context.directoryTree.length > 50) { context.directoryTree.pop(); return true; }
  if ('latestCodeReview' in payload && payload.latestCodeReview !== null) { payload.latestCodeReview = null; return true; }
  if (context.coreModules.length > 20) { context.coreModules.pop(); return true; }
  if (context.snippets.length > 1) { context.snippets.pop(); return true; }
  const snippet = context.snippets[0];
  if (snippet && snippet.content.length > 1_000) {
    snippet.content = snippet.content.slice(0, Math.max(1_000, Math.floor(snippet.content.length / 2)));
    snippet.truncated = true;
    return true;
  }
  if (context.directoryTree.length > 0) { context.directoryTree.pop(); return true; }
  if (context.testFiles.length > 1) { context.testFiles.pop(); return true; }
  if (context.configFiles.length > 1) { context.configFiles.pop(); return true; }
  if (context.entryFiles.length > 1) { context.entryFiles.pop(); return true; }
  if (context.evidencePaths.length > 1) { context.evidencePaths.pop(); return true; }
  if (Array.isArray(context.techStack) && context.techStack.length > 1) { context.techStack.pop(); return true; }
  return false;
}

function boundedValue(value: unknown, maxChars: number): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  if (serialized.length <= maxChars) return cloneJson(value);
  return { truncated: true, serializedExcerpt: serialized.slice(0, maxChars) };
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
