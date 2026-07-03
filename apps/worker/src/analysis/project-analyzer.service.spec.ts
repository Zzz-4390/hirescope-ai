import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectAnalyzerService } from './project-analyzer.service';

describe('ProjectAnalyzerService', () => {
  it('produces deterministic structure, stack, entries, modules, and statistics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-analysis-'));
    await mkdir(join(root, 'src', 'auth'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } }));
    await writeFile(join(root, 'src', 'index.ts'), 'export const value = 1;\n');
    await writeFile(join(root, 'src', 'auth', 'service.ts'), 'export class AuthService {}\n');
    const result = await new ProjectAnalyzerService(1024 * 1024).analyze(root);
    expect(result.techStack).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Next.js' }), expect.objectContaining({ name: 'TypeScript' })]));
    expect(result.entryFiles).toContain('src/index.ts');
    expect(result.coreModules).toContainEqual(expect.objectContaining({ path: 'src/auth' }));
    expect(result.statistics.totalFiles).toBe(3);
    expect(result.directoryTree.map((item) => item.path)).toEqual([...result.directoryTree.map((item) => item.path)].sort());
  });
});
