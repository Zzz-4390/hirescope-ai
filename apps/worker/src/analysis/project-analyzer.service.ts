import type { ProjectAnalysisResult } from '@hirescope/shared-types';
import { open, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const LANGUAGE_BY_EXTENSION: Record<string, string> = { '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.py': 'Python', '.java': 'Java', '.kt': 'Kotlin', '.go': 'Go', '.rs': 'Rust', '.cs': 'C#', '.vue': 'Vue', '.php': 'PHP', '.rb': 'Ruby' };
const ENTRY_NAMES = new Set(['src/index.ts', 'src/main.ts', 'src/index.js', 'src/main.js', 'app.ts', 'app.js', 'main.py', 'manage.py', 'pom.xml', 'go.mod', 'Cargo.toml']);

export class ProjectAnalyzerService {
  constructor(private readonly maxTextReadBytes: number) {}

  async analyze(root: string): Promise<ProjectAnalysisResult> {
    const directoryTree: Array<{ path: string; type: 'file' | 'directory' }> = [];
    const filePaths: string[] = [];
    await this.walk(root, root, directoryTree, filePaths);
    directoryTree.sort((a, b) => a.path.localeCompare(b.path));
    filePaths.sort();
    const languages: Record<string, number> = {};
    let totalLines = 0;
    for (const path of filePaths) {
      const language = LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()];
      if (!language) continue;
      languages[language] = (languages[language] ?? 0) + 1;
      totalLines += await this.countLines(join(root, path));
    }
    const techStack = Object.keys(languages).sort().map((name) => ({ name, category: 'language' }));
    await this.detectManifests(root, filePaths, techStack);
    const entryFiles = filePaths.filter((path) => ENTRY_NAMES.has(path) || /(^|\/)pages\/.*\.(tsx?|jsx?)$/.test(path));
    const sourceModules = directoryTree.filter((item) => item.type === 'directory' && /^src\/[^/]+$/.test(item.path));
    const coreModules = sourceModules.map((item) => ({ name: item.path.split('/').at(-1)!, path: item.path, description: `Source module ${item.path}` }));
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

  private async walk(root: string, current: string, tree: Array<{ path: string; type: 'file' | 'directory' }>, files: string[]): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(current, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) { tree.push({ path, type: 'directory' }); await this.walk(root, absolute, tree, files); }
      else if (entry.isFile()) { tree.push({ path, type: 'file' }); files.push(path); }
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
    } finally { await handle.close(); }
  }

  private async detectManifests(root: string, files: string[], stack: Array<{ name: string; category: string; version?: string }>): Promise<void> {
    if (files.includes('package.json')) {
      try {
        const manifest = JSON.parse(await this.readBoundedText(join(root, 'package.json'))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = { ...manifest.dependencies, ...manifest.devDependencies };
        const mappings: Record<string, string> = { next: 'Next.js', react: 'React', vue: 'Vue', '@nestjs/core': 'NestJS', express: 'Express' };
        for (const [dependency, name] of Object.entries(mappings)) if (deps[dependency]) stack.push({ name, category: 'framework', version: deps[dependency] });
      } catch { /* malformed manifests are ignored by deterministic detection */ }
    }
    const manifests: Array<[string, string, string]> = [['pom.xml', 'Maven', 'build'], ['requirements.txt', 'Python requirements', 'build'], ['pyproject.toml', 'Python', 'language'], ['go.mod', 'Go Modules', 'build'], ['Cargo.toml', 'Cargo', 'build']];
    for (const [file, name, category] of manifests) if (files.includes(file)) stack.push({ name, category });
  }

  private uniqueStack(stack: Array<{ name: string; category: string; version?: string }>) {
    return [...new Map(stack.map((item) => [`${item.category}:${item.name}`, item])).values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private async readBoundedText(path: string): Promise<string> {
    const size = Math.min((await stat(path)).size, this.maxTextReadBytes);
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buffer, 0, size, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await handle.close(); }
  }
}
