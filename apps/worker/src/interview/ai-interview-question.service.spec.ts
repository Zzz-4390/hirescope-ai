import { InterviewDifficulty } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiInterviewQuestionService } from './ai-interview-question.service';

const CONTEXT = { userId: 'user', projectId: 'project', taskId: 'task' };
const ANALYSIS = { summary: 'NestJS API', techStack: [{ name: 'TypeScript' }], coreModules: [{ name: 'Interviews' }], statistics: { totalFiles: 10 } };
const QUESTIONS = { questions: Array.from({ length: 5 }, (_, index) => ({ sequence: index + 1, category: 'project', difficulty: 'MEDIUM', question: `Question ${index + 1}`, referencePoints: ['point'] })) };

function setup(content: string) {
  const provider = {
    providerName: 'openai-compatible',
    model: 'test-model',
    completeJson: vi.fn().mockResolvedValue({ content, model: 'actual-test-model', durationMs: 12, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } }),
  };
  const logs = { record: vi.fn().mockResolvedValue(undefined) };
  return { provider, logs, service: new AiInterviewQuestionService(provider as never, logs) };
}

describe('AiInterviewQuestionService', () => {
  it('strictly validates and returns the requested project questions', async () => {
    const { service, provider, logs } = setup(JSON.stringify(QUESTIONS));
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT)).resolves.toEqual(QUESTIONS);
    expect(provider.completeJson).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining('NestJS API') }));
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', provider: 'openai-compatible', model: 'actual-test-model', totalTokens: 30 }));
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('apiKey');
  });

  it('rejects illegal JSON and records a safe failure code', async () => {
    const { service, logs } = setup('```json\n{}\n```');
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_JSON_INVALID' });
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_JSON_INVALID' }));
  });

  it('rejects missing fields and extra fields through the strict Zod schema', async () => {
    const missing = { questions: [{ sequence: 1, category: 'project', difficulty: 'MEDIUM', question: 'Question' }] };
    const { service } = setup(JSON.stringify(missing));
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_SCHEMA_INVALID' });

    const extra = { ...QUESTIONS, unexpected: true };
    const extraSetup = setup(JSON.stringify(extra));
    await expect(extraSetup.service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_SCHEMA_INVALID' });
  });

  it('rejects a valid shape with the wrong count or difficulty', async () => {
    const wrong = { questions: QUESTIONS.questions.slice(0, 4) };
    const { service } = setup(JSON.stringify(wrong));
    await expect(service.generate(ANALYSIS, null, 5, InterviewDifficulty.MEDIUM, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_SCHEMA_INVALID' });
  });

  it('uses the requested difficulty consistently in the structured-output prompt', async () => {
    const hardQuestions = { questions: QUESTIONS.questions.map((question) => ({ ...question, difficulty: 'HARD' })) };
    const { service, provider } = setup(JSON.stringify(hardQuestions));
    await service.generate(ANALYSIS, null, 5, InterviewDifficulty.HARD, CONTEXT);
    expect(provider.completeJson.mock.calls[0]![0].systemPrompt).toContain('"difficulty":"HARD"');
  });
});
