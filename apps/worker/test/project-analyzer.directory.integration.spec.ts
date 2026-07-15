import { ProjectAnalysisResultSchema } from '@hirescope/shared-types';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectAnalyzerService } from '../src/analysis/project-analyzer.service';

describe('ProjectAnalyzerService directory integration', () => {
  it('analyzes an outer ZIP directory containing Maven and Node subprojects', async () => {
    const fixture = join(__dirname, '..', 'src', 'analysis', 'fixtures', 'archive-wrapper');
    const result = await new ProjectAnalyzerService(1024 * 1024).analyze(fixture);
    const stackByName = new Map(result.techStack.map((item) => [item.name, item]));

    expect([...stackByName.keys()]).toEqual([
      'Axios',
      'JPA',
      'Java',
      'JavaScript',
      'Lombok',
      'Maven',
      'MyBatis',
      'MySQL Driver',
      'Pinia',
      'PostgreSQL Driver',
      'Spring Boot',
      'Spring MVC',
      'Vite',
      'Vue',
      'Vue Router',
      'pnpm',
    ]);
    expect(stackByName.get('Vue')).toMatchObject({ category: 'framework' });
    expect(stackByName.get('Vite')).toMatchObject({ category: 'tool' });
    expect(stackByName.get('Maven')).toMatchObject({ category: 'tool' });
    expect(result.entryFiles).toEqual([
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/LostFoundApplication.java',
      'fixture-root/lostfound-frontend/src/App.vue',
      'fixture-root/lostfound-frontend/src/main.js',
    ]);
    expect(result.directoryTree).toEqual(expect.arrayContaining([
      { path: 'fixture-root/lostfound-backend/src/test/java/com/example/lostfound/service/LostItemServiceTest.java', type: 'file' },
      { path: 'fixture-root/lostfound-frontend/src/tests/LostItemCard.js', type: 'file' },
    ]));
    expect(result.coreModules.map((module) => module.path)).toEqual([
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/config',
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/controller',
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/entity',
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/mapper',
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/repository',
      'fixture-root/lostfound-backend/src/main/java/com/example/lostfound/service',
      'fixture-root/lostfound-frontend/src/api',
      'fixture-root/lostfound-frontend/src/components',
      'fixture-root/lostfound-frontend/src/pages',
      'fixture-root/lostfound-frontend/src/router',
      'fixture-root/lostfound-frontend/src/stores',
      'fixture-root/lostfound-frontend/src/utils',
      'fixture-root/lostfound-frontend/src/views',
    ]);
    expect(result.analyzerVersion).toBe('deterministic-v1');
    expect(result.techStack.map(({ category, name }) => `${category}:${name}`)).toEqual([...new Set(result.techStack.map(({ category, name }) => `${category}:${name}`))]);
    expect(result.directoryTree.map((item) => item.path)).toEqual([...result.directoryTree.map((item) => item.path)].sort());
    expect(ProjectAnalysisResultSchema.safeParse(result).success).toBe(true);
  });
});
