import { InterviewDifficulty, InterviewStatus, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewQuestionGenerationError } from '../interview/ai-interview-question.service';
import { InterviewQuestionProcessor } from './interview-question.processor';

const EVIDENCE = {
  techStack: [{ name: 'TypeScript' }],
  directoryTree: [{ path: 'src/main.ts', type: 'file' as const }],
  testFiles: [],
  entryFiles: ['src/main.ts'],
  coreModules: [{ path: 'src' }],
  configFiles: [],
  snippets: [{ path: 'src/main.ts', content: 'export function bootstrap() {}', truncated: false }],
  evidencePaths: ['src/main.ts'],
  budget: { maxFileChars: 8_000, maxSnippetChars: 48_000, maxContextChars: 64_000, usedSnippetChars: 30, usedContextChars: 500 },
};
const VALID = {
  questions: Array.from({ length: 5 }, (_, index) => ({
    sequence: index + 1,
    category: '核心实现',
    difficulty: 'MEDIUM',
    question: `请说明项目问题 ${index + 1}`,
    referencePoints: ['说明关键实现'],
    evidencePaths: ['src/main.ts'],
  })),
};

describe('InterviewQuestionProcessor', () => {
  it('builds project evidence and writes questions plus internal metadata atomically', async () => {
    const { processor, tx, generator, contextBuilder } = setup();
    await processor.process('task');
    expect(contextBuilder.build).toHaveBeenCalledWith('D:\\storage\\project', expect.objectContaining({ directoryTree: expect.any(Array), entryFiles: ['src/main.ts'] }));
    expect(generator.generate).toHaveBeenCalledWith(expect.anything(), null, 5, InterviewDifficulty.MEDIUM, expect.anything(), EVIDENCE);
    expect(tx.interviewQuestion.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({
        interviewId: 'interview',
        sequence: 1,
        referencePoints: { points: ['说明关键实现'], evidencePaths: ['src/main.ts'] },
      })]),
    });
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.READY }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, progress: 100 }) }));
  });

  it('blocks fabricated evidence paths without writing any question', async () => {
    const generated = { questions: VALID.questions.map((question) => ({ ...question, evidencePaths: ['src/missing.ts'] })) };
    const { processor, tx } = setup(task(), generated);
    await processor.process('task');
    expect(tx.interviewQuestion.createMany).not.toHaveBeenCalled();
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.FAILED, failureCode: 'INTERVIEW_QUESTIONS_EVIDENCE_INVALID' }) }));
  });

  it('fails invalid output without writing partial questions', async () => {
    const { processor, tx } = setup(task(), { questions: [{ sequence: 1 }] });
    await processor.process('task');
    expect(tx.interviewQuestion.createMany).not.toHaveBeenCalled();
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.FAILED, failureCode: 'INTERVIEW_QUESTIONS_RESULT_INVALID' }) }));
  });

  it('fails closed when no real project evidence can be built', async () => {
    const { processor, tx, contextBuilder, generator } = setup();
    contextBuilder.build.mockResolvedValue({ ...EVIDENCE, evidencePaths: [] });
    await processor.process('task');
    expect(generator.generate).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: 'INTERVIEW_QUESTION_EVIDENCE_MISSING' }) }));
  });

  it('cancels deleting projects without building evidence or writing questions', async () => {
    const { processor, tx, generator, contextBuilder } = setup(task(ProjectStatus.DELETING));
    await processor.process('task');
    expect(contextBuilder.build).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
    expect(tx.interviewQuestion.createMany).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED }) }));
  });

  it('rejects non-completed projects before generation', async () => {
    const { processor, generator, tx } = setup(task(ProjectStatus.ANALYZING));
    await processor.process('task');
    expect(generator.generate).not.toHaveBeenCalled();
    expect(tx.interviewQuestion.createMany).not.toHaveBeenCalled();
  });

  it('maps unrecoverable generator failures to terminal task state without partial writes', async () => {
    const { processor, generator, tx } = setup();
    generator.generate.mockRejectedValue(new InterviewQuestionGenerationError('AI_UPSTREAM_ERROR'));
    await processor.process('task');
    expect(tx.interviewQuestion.createMany).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'AI_UPSTREAM_ERROR' }) }));
  });

  it('does not write questions twice when a completed job is delivered again', async () => {
    const { processor, prisma, tx } = setup();
    const ready = task(ProjectStatus.COMPLETED, InterviewStatus.READY, TaskStatus.SUCCEEDED);
    prisma.asyncTask.findUnique.mockResolvedValueOnce(task()).mockResolvedValueOnce(ready);
    await processor.process('task');
    await processor.process('task');
    expect(tx.interviewQuestion.createMany).toHaveBeenCalledTimes(1);
  });
});

function task(
  projectStatus: ProjectStatus = ProjectStatus.COMPLETED,
  interviewStatus: InterviewStatus = InterviewStatus.GENERATING,
  taskStatus: TaskStatus = TaskStatus.QUEUED,
): any {
  return {
    id: 'task', userId: 'user', type: TaskType.INTERVIEW_QUESTION_GENERATION, status: taskStatus,
    projectId: 'project', interviewId: 'interview',
    interview: { id: 'interview', status: interviewStatus, questionCount: 5, difficulty: InterviewDifficulty.MEDIUM },
    project: {
      id: 'project', status: projectStatus, extractStoragePath: 'projects/extracted',
      analysis: {
        summary: 'summary', techStack: [{ name: 'TypeScript' }],
        directoryTree: [{ path: 'src/main.ts', type: 'file' }], coreModules: [{ path: 'src' }],
        entryFiles: ['src/main.ts'], statistics: {},
      },
      codeReviews: [],
    },
  };
}

function setup(value: any = task(), generated: any = VALID) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ interviewStatus: value.interview.status, projectStatus: value.project.status }]),
    asyncTask: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    interview: { update: vi.fn() },
    interviewQuestion: { createMany: vi.fn() },
  };
  const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(value) }, $transaction: vi.fn((callback) => callback(tx)) };
  const generator = { generate: vi.fn().mockReturnValue(generated) };
  const paths = { resolveStoredPath: vi.fn().mockReturnValue('D:\\storage\\project') };
  const contextBuilder = { build: vi.fn().mockResolvedValue(EVIDENCE) };
  return {
    tx, prisma, generator, contextBuilder,
    processor: new InterviewQuestionProcessor(prisma as never, generator as never, paths as never, contextBuilder as never),
  };
}
