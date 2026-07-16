import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODE_REVIEW_CONTEXT_LIMITS, CodeReviewContextBuilder } from './code-review-context-builder';

describe('CodeReviewContextBuilder', () => {
  it('identifies tests and configs, orders deterministically, and excludes sensitive or generated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-review-context-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'test'), { recursive: true });
    await mkdir(join(root, 'prisma'), { recursive: true });
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '11.0.0' } }));
    await writeFile(join(root, 'prisma', 'schema.prisma'), 'model User { id String @id }');
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), 'name: CI');
    await writeFile(join(root, 'src', 'main.ts'), 'export const bootstrap = true;');
    await writeFile(join(root, 'src', 'review.service.ts'), 'export class ReviewService {}');
    await writeFile(join(root, 'test', 'review.spec.ts'), 'describe("review", () => {});');
    await writeFile(join(root, '.env'), 'AI_API_KEY=must-not-leak');
    await writeFile(join(root, 'server.pem'), 'private-key');
    await writeFile(join(root, '.npmrc'), '//registry.example/:_authToken=must-not-leak');
    await writeFile(join(root, 'service.credentials.json'), '{"token":"must-not-leak"}');
    await writeFile(join(root, 'src', 'leaky-auth.service.ts'), 'const token = "literal-token-must-not-leak";');
    await writeFile(join(root, 'logo.png'), Buffer.from([0, 1, 2]));
    await writeFile(join(root, 'node_modules', 'dep', 'index.js'), 'dependency');

    const directoryTree = [
      { path: 'src/review.service.ts', type: 'file' }, { path: '.env', type: 'file' },
      { path: 'test/review.spec.ts', type: 'file' }, { path: 'package.json', type: 'file' },
      { path: 'src/main.ts', type: 'file' }, { path: 'prisma/schema.prisma', type: 'file' },
      { path: '.github/workflows/ci.yml', type: 'file' }, { path: 'server.pem', type: 'file' },
      { path: '.npmrc', type: 'file' }, { path: 'service.credentials.json', type: 'file' },
      { path: 'src/leaky-auth.service.ts', type: 'file' },
      { path: 'logo.png', type: 'file' }, { path: 'node_modules/dep/index.js', type: 'file' },
      { path: 'src', type: 'directory' }, { path: 'test', type: 'directory' },
    ];
    const analysis = {
      summary: 'NestJS project', techStack: [{ name: 'NestJS' }], directoryTree,
      coreModules: [{ name: 'review', path: 'src', description: 'review module' }],
      entryFiles: ['src/main.ts'], statistics: { totalFiles: directoryTree.length },
    };

    const first = await new CodeReviewContextBuilder().build(root, analysis);
    const second = await new CodeReviewContextBuilder().build(root, { ...analysis, directoryTree: [...directoryTree].reverse() });

    expect(first).toEqual(second);
    expect(first.testFiles).toEqual(['test/review.spec.ts']);
    expect(first.entryFiles).toEqual(['src/main.ts']);
    expect(first.configFiles).toEqual(['.github/workflows/ci.yml', 'package.json', 'prisma/schema.prisma']);
    expect(first.snippets.slice(0, 3).map((snippet) => snippet.path)).toEqual(['.github/workflows/ci.yml', 'package.json', 'prisma/schema.prisma']);
    expect(first.evidencePaths).toEqual(expect.arrayContaining(['src/main.ts', 'src/review.service.ts', 'test/review.spec.ts']));
    expect(JSON.stringify(first)).not.toContain('must-not-leak');
    expect(first.evidencePaths).not.toEqual(expect.arrayContaining(['.env', '.npmrc', 'server.pem', 'service.credentials.json', 'src/leaky-auth.service.ts', 'logo.png', 'node_modules/dep/index.js']));
  });

  it('enforces per-file, snippet, and total budgets with stable truncation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-review-budget-'));
    await mkdir(join(root, 'src'), { recursive: true });
    const directoryTree: Array<{ path: string; type: 'file' }> = [];
    for (let index = 0; index < 20; index += 1) {
      const path = `src/file-${String(index).padStart(2, '0')}.ts`;
      directoryTree.push({ path, type: 'file' });
      await writeFile(join(root, ...path.split('/')), `${index}:`.padEnd(20_000, 'x'));
    }
    const context = await new CodeReviewContextBuilder().build(root, { techStack: [], directoryTree: [...directoryTree].reverse(), coreModules: [{ path: 'src' }], entryFiles: [], statistics: {} });

    expect(context.snippets.every((snippet) => snippet.content.length <= CODE_REVIEW_CONTEXT_LIMITS.maxFileChars)).toBe(true);
    expect(context.snippets.length).toBeLessThanOrEqual(CODE_REVIEW_CONTEXT_LIMITS.maxSnippetFiles);
    expect(context.budget.usedSnippetChars).toBeLessThanOrEqual(CODE_REVIEW_CONTEXT_LIMITS.maxSnippetChars);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(CODE_REVIEW_CONTEXT_LIMITS.maxContextChars);
    expect(context.snippets.map((snippet) => snippet.path)).toEqual([...context.snippets.map((snippet) => snippet.path)].sort());
    expect(context.snippets.some((snippet) => snippet.truncated)).toBe(true);
  });

  it('prioritizes controllers, services, database, queue, auth, entries, and tests while skipping oversized files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-review-priority-'));
    const important = [
      'src/auth/auth.guard.ts', 'src/users/users.controller.ts', 'src/users/users.service.ts',
      'src/database/user.repository.ts', 'src/queue/task.processor.ts', 'src/main.ts', 'test/users.spec.ts', 'package.json',
    ];
    const generic = Array.from({ length: 30 }, (_, index) => `src/generic/file-${String(index).padStart(2, '0')}.ts`);
    const oversized = 'src/users/oversized.service.ts';
    for (const path of [...important, ...generic, oversized]) {
      const segments = path.split('/');
      await mkdir(join(root, ...segments.slice(0, -1)), { recursive: true });
      await writeFile(join(root, ...segments), path === oversized ? 'x'.repeat(CODE_REVIEW_CONTEXT_LIMITS.maxFileBytes + 1) : `export const value = '${path}';`);
    }
    const paths = [...important, ...generic, oversized];
    const context = await new CodeReviewContextBuilder().build(root, {
      techStack: [{ name: 'TypeScript' }], directoryTree: paths.map((path) => ({ path, type: 'file' as const })),
      coreModules: [{ path: 'src' }], entryFiles: ['src/main.ts'], statistics: {},
    });

    expect(context.snippets.length).toBeLessThanOrEqual(CODE_REVIEW_CONTEXT_LIMITS.maxSnippetFiles);
    expect(context.snippets.map((snippet) => snippet.path)).toEqual(expect.arrayContaining(important));
    expect(context.evidencePaths).not.toContain(oversized);
  });

  it('keeps evidence from multiple deeply nested monorepo subprojects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-review-monorepo-'));
    const files = [
      ['wrapper/apps/api/package.json', '{}'],
      ['wrapper/apps/api/src/main.ts', 'export function bootstrapApi() {}'],
      ['wrapper/apps/api/test/api.spec.ts', 'describe("api", () => {})'],
      ['wrapper/apps/worker/package.json', '{}'],
      ['wrapper/apps/worker/src/main.ts', 'export function bootstrapWorker() {}'],
      ['wrapper/apps/worker/tests/worker.test.ts', 'describe("worker", () => {})'],
    ] as const;
    for (const [path, content] of files) {
      const segments = path.split('/');
      await mkdir(join(root, ...segments.slice(0, -1)), { recursive: true });
      await writeFile(join(root, ...segments), content);
    }
    const analysis = {
      techStack: [{ name: 'TypeScript' }],
      directoryTree: files.map(([path]) => ({ path, type: 'file' as const })),
      coreModules: [
        { name: 'api', path: 'wrapper/apps/api/src', description: 'api' },
        { name: 'worker', path: 'wrapper/apps/worker/src', description: 'worker' },
      ],
      entryFiles: ['wrapper/apps/api/src/main.ts', 'wrapper/apps/worker/src/main.ts'],
      statistics: { totalFiles: files.length },
    };

    const context = await new CodeReviewContextBuilder().build(root, analysis);

    expect(context.entryFiles).toEqual(['wrapper/apps/api/src/main.ts', 'wrapper/apps/worker/src/main.ts']);
    expect(context.testFiles).toEqual(['wrapper/apps/api/test/api.spec.ts', 'wrapper/apps/worker/tests/worker.test.ts']);
    expect(context.configFiles).toEqual(['wrapper/apps/api/package.json', 'wrapper/apps/worker/package.json']);
    expect(context.evidencePaths).toEqual(expect.arrayContaining(files.map(([path]) => path)));
  });
});
