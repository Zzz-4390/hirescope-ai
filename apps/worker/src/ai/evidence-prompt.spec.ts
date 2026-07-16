import { describe, expect, it } from 'vitest';
import { AI_EVIDENCE_PROMPT_LIMITS, buildEvidencePrompts } from './evidence-prompt';

describe('buildEvidencePrompts', () => {
  it('caps the total prompt deterministically while retaining controlled evidence sections', () => {
    const reviewContext = {
      techStack: [{ name: 'TypeScript' }],
      directoryTree: Array.from({ length: 400 }, (_, index) => ({ path: `src/file-${index}.ts`, type: 'file' as const })),
      testFiles: ['test/main.spec.ts'], entryFiles: ['src/main.ts'], coreModules: [{ path: 'src' }], configFiles: ['package.json'],
      snippets: [
        { path: 'package.json', content: '{"scripts":{"test":"vitest"}}', truncated: false },
        { path: 'src/main.ts', content: 'export function bootstrap() {}'.padEnd(40_000, 'x'), truncated: true },
        { path: 'test/main.spec.ts', content: 'describe("bootstrap", () => {});', truncated: false },
      ],
      evidencePaths: ['package.json', 'src/main.ts', 'test/main.spec.ts'],
      budget: { maxFileChars: 8_000, maxSnippetChars: 40_000, maxContextChars: 48_000, usedSnippetChars: 40_000, usedContextChars: 48_000 },
    };
    const input = {
      systemPrompt: 'system rules', task: 'review', projectSummary: { summary: 's'.repeat(20_000) },
      latestCodeReview: { result: 'r'.repeat(40_000) }, reviewContext,
    };

    const first = buildEvidencePrompts(input);
    const second = buildEvidencePrompts(input);

    expect(first).toEqual(second);
    expect(first.systemPrompt.length + first.userPrompt.length).toBeLessThanOrEqual(AI_EVIDENCE_PROMPT_LIMITS.maxTotalChars);
    expect(first.userPrompt).toContain('package.json');
    expect(first.userPrompt).toContain('test/main.spec.ts');
    expect(first.userPrompt).toContain('src/main.ts');
  });
});
