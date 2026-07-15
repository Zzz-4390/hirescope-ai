import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectAnalyzerService } from './project-analyzer.service';

const analyzer = new ProjectAnalyzerService(1024 * 1024);

describe('ProjectAnalyzerService', () => {
  it('produces deterministic results for multiple nested Node subprojects and ignores malformed manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-analysis-'));
    await mkdir(join(root, 'outer', 'apps', 'web', 'src', 'components'), { recursive: true });
    await mkdir(join(root, 'outer', 'apps', 'admin', 'src', 'pages'), { recursive: true });
    await mkdir(join(root, 'outer', 'broken'), { recursive: true });
    await writeFile(join(root, 'outer', 'apps', 'web', 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' }, devDependencies: { vite: '7.0.0' } }));
    await writeFile(join(root, 'outer', 'apps', 'web', 'package-lock.json'), '{}');
    await writeFile(join(root, 'outer', 'apps', 'web', 'src', 'main.tsx'), 'export const value = 1;\n');
    await writeFile(join(root, 'outer', 'apps', 'web', 'src', 'components', 'Button.tsx'), 'export const Button = () => null;\n');
    await writeFile(join(root, 'outer', 'apps', 'admin', 'package.json'), JSON.stringify({ dependencies: { vue: '3.5.0' } }));
    await writeFile(join(root, 'outer', 'apps', 'admin', 'yarn.lock'), '# yarn lockfile');
    await writeFile(join(root, 'outer', 'apps', 'admin', 'src', 'main.js'), 'export const admin = true;\n');
    await writeFile(join(root, 'outer', 'apps', 'admin', 'src', 'pages', 'Home.vue'), '<template />\n');
    await writeFile(join(root, 'outer', 'broken', 'package.json'), '{ invalid json');
    await writeFile(join(root, 'outer', 'broken', 'pom.xml'), '<project>');

    const first = await analyzer.analyze(root);
    const second = await analyzer.analyze(root);

    expect(first).toEqual(second);
    expect(first.techStack).toEqual(expect.arrayContaining([
      { name: 'JavaScript', category: 'language' },
      { name: 'Next.js', category: 'framework', version: '15.0.0' },
      { name: 'React', category: 'framework', version: '19.0.0' },
      { name: 'TypeScript', category: 'language' },
      { name: 'Vite', category: 'tool', version: '7.0.0' },
      { name: 'Vue', category: 'framework', version: '3.5.0' },
      { name: 'Yarn', category: 'tool' },
      { name: 'npm', category: 'tool' },
    ]));
    expect(first.techStack).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Vue', category: 'language' }),
      expect.objectContaining({ name: 'Vite', category: 'language' }),
      expect.objectContaining({ name: 'Vite', category: 'framework' }),
      expect.objectContaining({ name: 'Maven' }),
    ]));
    expect(first.entryFiles).toEqual(['outer/apps/admin/src/main.js', 'outer/apps/web/src/main.tsx']);
    expect(first.coreModules.map((module) => module.path)).toEqual(['outer/apps/admin/src/pages', 'outer/apps/web/src/components']);
    expect(first.directoryTree.every((entry) => !entry.path.includes('\\'))).toBe(true);
  });

  it('finds Java entries and deep modules in every nested Maven subproject', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-analysis-'));
    const firstRoot = join(root, 'wrapper', 'services', 'first');
    const secondRoot = join(root, 'wrapper', 'services', 'second');
    await mkdir(join(firstRoot, 'src', 'main', 'java', 'com', 'example', 'controller'), { recursive: true });
    await mkdir(join(secondRoot, 'src', 'main', 'java', 'com', 'example', 'service'), { recursive: true });
    await mkdir(join(secondRoot, 'src', 'test', 'java', 'com', 'example', 'service'), { recursive: true });
    await writeFile(join(firstRoot, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion><dependencyManagement><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></dependencyManagement></project>');
    await writeFile(join(secondRoot, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion><build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>');
    await writeFile(join(firstRoot, 'src', 'main', 'java', 'com', 'example', 'FirstApplication.java'), 'class FirstApplication {}');
    await writeFile(join(firstRoot, 'src', 'main', 'java', 'com', 'example', 'controller', 'FirstController.java'), 'class FirstController {}');
    await writeFile(join(secondRoot, 'src', 'main', 'java', 'com', 'example', 'Bootstrap.java'), 'class Bootstrap { public static void main(String[] args) { SpringApplication.run(Bootstrap.class, args); } }');
    await writeFile(join(secondRoot, 'src', 'main', 'java', 'com', 'example', 'service', 'SecondService.java'), 'class SecondService {}');
    await writeFile(join(secondRoot, 'src', 'test', 'java', 'com', 'example', 'service', 'TestApplication.java'), 'class TestApplication {}');

    const result = await analyzer.analyze(root);

    expect(result.entryFiles).toEqual([
      'wrapper/services/first/src/main/java/com/example/FirstApplication.java',
      'wrapper/services/second/src/main/java/com/example/Bootstrap.java',
    ]);
    expect(result.coreModules.map((module) => module.path)).toEqual([
      'wrapper/services/first/src/main/java/com/example/controller',
      'wrapper/services/second/src/main/java/com/example/service',
    ]);
    expect(result.directoryTree).toContainEqual({ path: 'wrapper/services/second/src/test/java/com/example/service/TestApplication.java', type: 'file' });
    expect(result.techStack).toEqual(expect.arrayContaining([
      { name: 'Java', category: 'language' },
      { name: 'Maven', category: 'tool' },
      { name: 'Spring Boot', category: 'framework' },
      { name: 'Spring MVC', category: 'framework' },
    ]));
    expect(result.techStack.map(({ category, name }) => `${category}:${name}`)).toEqual([...new Set(result.techStack.map(({ category, name }) => `${category}:${name}`))]);
    expect(result.techStack).toEqual([...result.techStack].sort((left, right) => left.name.localeCompare(right.name, 'en') || left.category.localeCompare(right.category, 'en') || (left.version ?? '').localeCompare(right.version ?? '', 'en')));
  });
});
