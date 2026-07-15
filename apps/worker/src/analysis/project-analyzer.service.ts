import type { ProjectAnalysisResult } from '@hirescope/shared-types';
import { open, readdir, stat } from 'node:fs/promises';
import { extname, join, posix, relative } from 'node:path';

type TechStackItem = ProjectAnalysisResult['techStack'][number];
type DirectoryEntry = ProjectAnalysisResult['directoryTree'][number];
type CoreModule = ProjectAnalysisResult['coreModules'][number];

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.go': 'Go',
  '.rs': 'Rust',
  '.cs': 'C#',
  '.php': 'PHP',
  '.rb': 'Ruby',
};

const NODE_DEPENDENCIES: Record<string, { name: string; category: string }> = {
  vue: { name: 'Vue', category: 'framework' },
  react: { name: 'React', category: 'framework' },
  next: { name: 'Next.js', category: 'framework' },
  vite: { name: 'Vite', category: 'tool' },
  axios: { name: 'Axios', category: 'dependency' },
  pinia: { name: 'Pinia', category: 'dependency' },
  'vue-router': { name: 'Vue Router', category: 'dependency' },
  '@nestjs/core': { name: 'NestJS', category: 'framework' },
  express: { name: 'Express', category: 'framework' },
};

const FRONTEND_ENTRY_FILES = ['src/main.js', 'src/main.ts', 'src/main.jsx', 'src/main.tsx', 'src/App.vue'];
const BACKEND_MODULE_NAMES = new Set(['controller', 'service', 'repository', 'mapper', 'entity', 'config']);
const FRONTEND_MODULE_NAMES = new Set(['views', 'pages', 'components', 'router', 'stores', 'api', 'utils']);

export class ProjectAnalyzerService {
  constructor(private readonly maxTextReadBytes: number) {}

  async analyze(root: string): Promise<ProjectAnalysisResult> {
    const directoryTree: DirectoryEntry[] = [];
    const filePaths: string[] = [];
    await this.walk(root, root, directoryTree, filePaths);
    directoryTree.sort((a, b) => compareText(a.path, b.path));
    filePaths.sort(compareText);

    const languageCounts = new Map<string, number>();
    let totalLines = 0;
    for (const path of filePaths) {
      const language = LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()];
      if (!language) continue;
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
      totalLines += await this.countLines(join(root, path));
    }
    const languages = Object.fromEntries([...languageCounts.entries()].sort(([left], [right]) => compareText(left, right)));

    const techStack: TechStackItem[] = Object.keys(languages).map((name) => ({ name, category: 'language' }));
    const fileSet = new Set(filePaths);
    const mavenRoots = filePaths.filter((path) => posix.basename(path) === 'pom.xml').map(projectRootForManifest);
    const nodeRoots = filePaths.filter((path) => posix.basename(path) === 'package.json').map(projectRootForManifest);
    await this.detectMavenProjects(root, filePaths, techStack);
    await this.detectNodeProjects(root, fileSet, filePaths, techStack);
    await this.detectOtherManifests(root, filePaths, techStack);

    const entryFiles = await this.detectEntryFiles(root, filePaths, fileSet, mavenRoots, nodeRoots);
    const coreModules = this.detectCoreModules(directoryTree, mavenRoots, nodeRoots);

    return {
      summary: `Detected ${filePaths.length} files across ${Object.keys(languages).length} programming languages.`,
      techStack: this.uniqueStack(techStack),
      directoryTree,
      coreModules,
      entryFiles,
      statistics: { totalFiles: filePaths.length, totalLines, languages },
      analyzerVersion: 'deterministic-v1',
    };
  }

  private async walk(root: string, current: string, tree: DirectoryEntry[], files: string[]): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(current, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        tree.push({ path, type: 'directory' });
        await this.walk(root, absolute, tree, files);
      } else if (entry.isFile()) {
        tree.push({ path, type: 'file' });
        files.push(path);
      }
    }
  }

  private async countLines(path: string): Promise<number> {
    const size = Math.min((await stat(path)).size, this.maxTextReadBytes);
    if (size === 0) return 0;
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buffer, 0, size, 0);
      if (buffer.subarray(0, bytesRead).includes(0)) return 0;
      return buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/).length;
    } finally {
      await handle.close();
    }
  }

  private async detectMavenProjects(root: string, files: string[], stack: TechStackItem[]): Promise<void> {
    const pomPaths = files.filter((path) => posix.basename(path) === 'pom.xml');
    for (const pomPath of pomPaths) {
      try {
        const coordinates = parsePomCoordinates(await this.readBoundedText(join(root, pomPath)));
        if (!coordinates) continue;
        stack.push({ name: 'Maven', category: 'tool' });
        if (hasCoordinate(coordinates, ['org.springframework.boot', 'spring-boot-starter-parent', 'spring-boot-maven-plugin', 'spring-boot-starter'])) {
          stack.push({ name: 'Spring Boot', category: 'framework' });
        }
        if (hasCoordinate(coordinates, ['spring-boot-starter-web', 'spring-web', 'spring-webmvc'])) {
          stack.push({ name: 'Spring MVC', category: 'framework' });
        }
        if (hasCoordinate(coordinates, ['org.mybatis', 'mybatis', 'mybatis-spring', 'mybatis-spring-boot-starter'])) {
          stack.push({ name: 'MyBatis', category: 'framework' });
        }
        if (hasCoordinate(coordinates, ['spring-boot-starter-data-jpa', 'hibernate-core', 'jakarta.persistence-api', 'javax.persistence-api'])) {
          stack.push({ name: 'JPA', category: 'dependency' });
        }
        if (hasCoordinate(coordinates, ['org.projectlombok', 'lombok'])) stack.push({ name: 'Lombok', category: 'dependency' });
        if (hasCoordinate(coordinates, ['com.mysql', 'mysql', 'mysql-connector-j', 'mysql-connector-java'])) stack.push({ name: 'MySQL Driver', category: 'dependency' });
        if (hasCoordinate(coordinates, ['org.postgresql', 'postgresql'])) stack.push({ name: 'PostgreSQL Driver', category: 'dependency' });
      } catch {
        // A single unreadable or malformed pom must not fail the project analysis.
      }
    }
  }

  private async detectNodeProjects(root: string, fileSet: Set<string>, files: string[], stack: TechStackItem[]): Promise<void> {
    const packagePaths = files.filter((path) => posix.basename(path) === 'package.json');
    for (const packagePath of packagePaths) {
      const projectRoot = projectRootForManifest(packagePath);
      try {
        const manifest = JSON.parse(await this.readBoundedText(join(root, packagePath))) as unknown;
        if (!isRecord(manifest)) continue;
        const dependencies = { ...dependencyRecord(manifest.dependencies), ...dependencyRecord(manifest.devDependencies) };
        for (const dependency of Object.keys(NODE_DEPENDENCIES).sort(compareText)) {
          const version = dependencies[dependency];
          const mapping = NODE_DEPENDENCIES[dependency];
          if (!version || !mapping) continue;
          stack.push({ ...mapping, version });
        }
      } catch {
        // A single unreadable or malformed package.json must not fail the project analysis.
      }

      const packageManagers: Array<[string, string]> = [
        ['package-lock.json', 'npm'],
        ['pnpm-lock.yaml', 'pnpm'],
        ['yarn.lock', 'Yarn'],
      ];
      for (const [lockFile, name] of packageManagers) {
        if (fileSet.has(pathFromProjectRoot(projectRoot, lockFile))) stack.push({ name, category: 'tool' });
      }
    }
  }

  private async detectOtherManifests(root: string, files: string[], stack: TechStackItem[]): Promise<void> {
    for (const path of files) {
      const name = posix.basename(path);
      if (!['requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml'].includes(name)) continue;
      try {
        const content = await this.readBoundedText(join(root, path));
        if (name === 'requirements.txt' && content.split(/\r?\n/).some((line) => line.trim() && !line.trimStart().startsWith('#'))) {
          stack.push({ name: 'Python requirements', category: 'tool' });
        } else if (name === 'pyproject.toml' && /^\s*\[(?:project|tool\.[^\]]+)\]/m.test(content)) {
          stack.push({ name: 'Python', category: 'language' });
        } else if (name === 'go.mod' && /^\s*module\s+\S+/m.test(content)) {
          stack.push({ name: 'Go Modules', category: 'tool' });
        } else if (name === 'Cargo.toml' && /^\s*\[package\]\s*$/m.test(content)) {
          stack.push({ name: 'Cargo', category: 'tool' });
        }
      } catch {
        // Optional ecosystem manifests are independent evidence sources.
      }
    }
  }

  private async detectEntryFiles(root: string, files: string[], fileSet: Set<string>, mavenRoots: string[], nodeRoots: string[]): Promise<string[]> {
    const entries = new Set<string>();
    for (const nodeRoot of nodeRoots) {
      for (const candidate of FRONTEND_ENTRY_FILES) {
        const path = pathFromProjectRoot(nodeRoot, candidate);
        if (fileSet.has(path)) entries.add(path);
      }
    }

    const javaFiles = files.filter((path) => extname(path).toLowerCase() === '.java' && !isTestPath(path) && mavenRoots.some((projectRoot) => isWithinProject(path, projectRoot)));
    for (const javaFile of javaFiles) {
      if (/Application\.java$/i.test(posix.basename(javaFile))) {
        entries.add(javaFile);
        continue;
      }
      try {
        const source = await this.readBoundedText(join(root, javaFile));
        if (/\bstatic\s+void\s+main\s*\(/.test(source) && /\bSpringApplication\s*\.\s*run\s*\(/.test(source)) entries.add(javaFile);
      } catch {
        // Source evidence is best-effort and must not make the analysis fail.
      }
    }
    return [...entries].sort(compareText);
  }

  private detectCoreModules(tree: DirectoryEntry[], mavenRoots: string[], nodeRoots: string[]): CoreModule[] {
    const modules = new Map<string, CoreModule>();
    for (const item of tree) {
      if (item.type !== 'directory') continue;
      if (isTestPath(item.path)) continue;
      const name = posix.basename(item.path).toLowerCase();
      const backend = BACKEND_MODULE_NAMES.has(name) && mavenRoots.some((root) => isWithinProject(item.path, root));
      const frontend = FRONTEND_MODULE_NAMES.has(name) && nodeRoots.some((root) => isWithinProject(item.path, root));
      if (!backend && !frontend) continue;
      modules.set(item.path, {
        name,
        path: item.path,
        description: `${backend ? 'Backend' : 'Frontend'} module ${item.path}`,
      });
    }
    return [...modules.values()].sort((a, b) => compareText(a.path, b.path));
  }

  private uniqueStack(stack: TechStackItem[]): TechStackItem[] {
    const sorted = [...stack].sort((left, right) => compareText(left.name, right.name) || compareText(left.category, right.category) || compareText(left.version ?? '', right.version ?? ''));
    return [...new Map(sorted.map((item) => [`${item.category}:${item.name}`, item])).values()];
  }

  private async readBoundedText(path: string): Promise<string> {
    const size = Math.min((await stat(path)).size, this.maxTextReadBytes);
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buffer, 0, size, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRootForManifest(path: string): string {
  const directory = posix.dirname(path);
  return directory === '.' ? '' : directory;
}

function pathFromProjectRoot(projectRoot: string, path: string): string {
  return projectRoot ? `${projectRoot}/${path}` : path;
}

function isWithinProject(path: string, projectRoot: string): boolean {
  return projectRoot === '' || path === projectRoot || path.startsWith(`${projectRoot}/`);
}

function isTestPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((segment) => ['test', 'tests', '__tests__', 'spec'].includes(segment.toLowerCase()))) return true;
  const fileName = posix.basename(path);
  return /\.(?:test|spec)\.[^./]+$/i.test(fileName) || /(?:Test|Tests|Spec|IT)\.(?:java|kt|groovy)$/.test(fileName);
}

function parsePomCoordinates(xml: string): Set<string> | null {
  const content = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<project(?:\s[^>]*)?>/i.test(content) || !/<\/project\s*>/i.test(content) || !/<modelVersion\b[^>]*>\s*4\.0\.0\s*<\/modelVersion\s*>/i.test(content)) return null;
  const coordinates = new Set<string>();
  for (const match of content.matchAll(/<(?:groupId|artifactId)\b[^>]*>([\s\S]*?)<\/(?:groupId|artifactId)\s*>/gi)) {
    const value = decodeXmlText(match[1] ?? '').trim().toLowerCase();
    if (value) coordinates.add(value);
  }
  return coordinates;
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function hasCoordinate(coordinates: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => coordinates.has(candidate));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dependencyRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0));
}
