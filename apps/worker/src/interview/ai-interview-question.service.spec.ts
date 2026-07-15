import { InterviewDifficulty } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../ai/openai-compatible.provider';
import { AiInterviewQuestionService } from './ai-interview-question.service';

const CONTEXT = { userId: 'user', projectId: 'project', taskId: 'task' };
const ANALYSIS = {
  summary: 'NestJS API',
  techStack: [{ name: 'TypeScript' }, { name: 'NestJS' }],
  directoryTree: [{ path: 'src/interview.service.ts', type: 'file' as const }],
  coreModules: [{ name: 'Interviews', path: 'src', description: 'interview flow' }],
  entryFiles: [],
  statistics: { totalFiles: 1 },
};
const EVIDENCE = {
  techStack: ANALYSIS.techStack,
  directoryTree: ANALYSIS.directoryTree,
  testFiles: [],
  entryFiles: [],
  coreModules: ANALYSIS.coreModules,
  configFiles: [],
  snippets: [{ path: 'src/interview.service.ts', content: 'export class InterviewService {}', truncated: false }],
  evidencePaths: ['src/interview.service.ts'],
  budget: { maxFileChars: 8_000, maxSnippetChars: 48_000, maxContextChars: 64_000, usedSnippetChars: 32, usedContextChars: 500 },
};
const QUESTIONS = {
  questions: Array.from({ length: 5 }, (_, index) => ({
    sequence: index + 1,
    category: '核心实现',
    difficulty: 'MEDIUM',
    question: `请说明 NestJS 面试模块的真实实现 ${index + 1}`,
    referencePoints: ['说明 TypeScript 模块边界'],
    evidencePaths: ['src/interview.service.ts'],
  })),
};

function completion(content: string) {
  return { content, model: 'actual-test-model', durationMs: 12, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } };
}

function setup(...responses: Array<string | Error>) {
  const completeJson = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) completeJson.mockRejectedValueOnce(response);
    else completeJson.mockResolvedValueOnce(completion(response));
  }
  const provider = { providerName: 'openai-compatible', model: 'test-model', completeJson };
  const logs = { record: vi.fn().mockResolvedValue(undefined) };
  return { provider, logs, service: new AiInterviewQuestionService(provider as never, logs) };
}

describe('AiInterviewQuestionService', () => {
  it('returns requested questions only when every evidence path belongs to the supplied context', async () => {
    const { service, provider, logs } = setup(JSON.stringify(QUESTIONS));
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT, EVIDENCE)).resolves.toEqual(QUESTIONS);
    expect(provider.completeJson).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining('src/interview.service.ts') }));
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', retryCount: 0, model: 'actual-test-model', totalTokens: 30 }));
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('apiKey');
  });

  it('retries a fabricated path and accepts a corrected evidence-grounded response', async () => {
    const fabricated = { questions: QUESTIONS.questions.map((question) => ({ ...question, evidencePaths: ['src/missing.service.ts'] })) };
    const { service, provider, logs } = setup(JSON.stringify(fabricated), JSON.stringify(QUESTIONS));
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT, EVIDENCE)).resolves.toEqual(QUESTIONS);
    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect(logs.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_EVIDENCE_INVALID', retryCount: 0 }));
  });

  it('rejects a technology absent from project evidence, then falls back without inventing it', async () => {
    const invented = { questions: QUESTIONS.questions.map((question) => ({ ...question, question: '请说明 Redis 集群的实现' })) };
    const { service } = setup(JSON.stringify(invented), JSON.stringify(invented));
    const generated = await service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT, EVIDENCE);
    expect(JSON.stringify(generated)).not.toContain('Redis');
    expect(generated.questions.every((question) => question.evidencePaths[0] === 'src/interview.service.ts')).toBe(true);
  });

  it('falls back to stable evidence-based questions after repeated illegal JSON', async () => {
    const { service, logs } = setup('```json\n{}\n```', '{');
    const first = await service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT, EVIDENCE);
    const secondSetup = setup('bad', 'bad');
    const second = await secondSetup.service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT, EVIDENCE);
    expect(first).toEqual(second);
    expect(first.questions).toHaveLength(5);
    expect(logs.record).toHaveBeenCalledTimes(2);
    expect(logs.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_JSON_INVALID', retryCount: 1 }));
  });

  it.each([
    ['AI_RATE_LIMITED', 429],
    ['AI_UPSTREAM_ERROR', 500],
    ['AI_REQUEST_TIMEOUT', undefined],
    ['AI_PROVIDER_RESPONSE_INVALID', undefined],
  ] as const)('degrades provider failure %s to deterministic questions', async (code, httpStatus) => {
    const { service, provider } = setup(new AiProviderError(code, 10, httpStatus));
    const generated = await service.generate(ANALYSIS, null, 5, InterviewDifficulty.HARD, CONTEXT, EVIDENCE);
    expect(generated.questions).toHaveLength(5);
    expect(generated.questions.every((question) => question.difficulty === 'HARD' && question.evidencePaths.length > 0)).toBe(true);
    expect(provider.completeJson).toHaveBeenCalledTimes(code === 'AI_PROVIDER_RESPONSE_INVALID' ? 2 : 1);
  });

  it('encodes evidence, language, shape, and difficulty rules in the prompt', async () => {
    const hard = { questions: QUESTIONS.questions.map((question) => ({ ...question, difficulty: 'HARD' })) };
    const { service, provider } = setup(JSON.stringify(hard));
    await service.generate(ANALYSIS, null, 5, InterviewDifficulty.HARD, CONTEXT, EVIDENCE);
    const prompt = provider.completeJson.mock.calls[0]![0].systemPrompt;
    expect(prompt).toContain('evidencePaths');
    expect(prompt).toContain('简体中文');
    expect(prompt).toContain('并发、失败恢复、一致性');
    expect(prompt).toContain('"difficulty":"HARD"');
  });
});
