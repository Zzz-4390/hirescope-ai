import { InterviewDifficulty } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DeterministicInterviewQuestionService } from './deterministic-interview-question.service';

const analysis = {
  techStack: [{ name: 'TypeScript', category: 'language' }],
  directoryTree: [
    { path: 'apps/api/src/main.ts', type: 'file' },
    { path: 'apps/api/test/interviews.spec.ts', type: 'file' },
    { path: 'apps/api/package.json', type: 'file' },
  ],
  coreModules: [{ name: 'API', path: 'apps/api/src', description: 'API' }],
  entryFiles: ['apps/api/src/main.ts'],
  statistics: { totalFiles: 3, totalLines: 100, languages: { TypeScript: 100 } },
};
const evidence = {
  techStack: analysis.techStack,
  directoryTree: analysis.directoryTree as Array<{ path: string; type: 'file' | 'directory' }>,
  testFiles: ['apps/api/test/interviews.spec.ts'],
  entryFiles: ['apps/api/src/main.ts'],
  coreModules: analysis.coreModules,
  configFiles: ['apps/api/package.json'],
  snippets: [
    { path: 'apps/api/src/main.ts', content: 'export async function bootstrap() {}', truncated: false },
    { path: 'apps/api/test/interviews.spec.ts', content: 'describe("interviews", () => {})', truncated: false },
    { path: 'apps/api/package.json', content: '{"scripts":{"test":"vitest"}}', truncated: false },
  ],
  evidencePaths: ['apps/api/package.json', 'apps/api/src/main.ts', 'apps/api/test/interviews.spec.ts'],
  budget: { maxFileChars: 8_000, maxSnippetChars: 48_000, maxContextChars: 64_000, usedSnippetChars: 100, usedContextChars: 1_000 },
};

describe('DeterministicInterviewQuestionService', () => {
  it('generates a stable exact count and grounds every question in a real evidence path', () => {
    const service = new DeterministicInterviewQuestionService();
    const first = service.generate(analysis, null, 8, InterviewDifficulty.MEDIUM, undefined, evidence);
    expect(first).toEqual(service.generate(analysis, null, 8, InterviewDifficulty.MEDIUM, undefined, evidence));
    expect(first.questions).toHaveLength(8);
    expect(first.questions.map((value) => value.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(first.questions.every((value) => value.difficulty === 'MEDIUM')).toBe(true);
    expect(first.questions.every((value) => value.evidencePaths.length >= 1 && value.evidencePaths.every((path) => evidence.evidencePaths.includes(path)))).toBe(true);
    expect(first.questions.every((value) => /[\u3400-\u9fff]/u.test(value.category) && /[\u3400-\u9fff]/u.test(value.question))).toBe(true);
    expect(JSON.stringify(first)).not.toContain('Redis');
  });

  it('uses only real source-code evidence without exposing full paths in question text', () => {
    const generated = new DeterministicInterviewQuestionService().generate(analysis, null, 3, InterviewDifficulty.HARD, undefined, evidence);
    expect(generated.questions.map((question) => question.category)).toEqual(['启动流程', '测试策略', '启动流程']);
    expect(generated.questions.map((question) => question.evidencePaths[0])).toEqual([
      'apps/api/src/main.ts',
      'apps/api/test/interviews.spec.ts',
      'apps/api/src/main.ts',
    ]);
    expect(generated.questions.every((question) => !question.question.includes('apps/api/'))).toBe(true);
  });
});
