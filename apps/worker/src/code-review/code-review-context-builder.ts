import { open, stat } from 'node:fs/promises';
import { extname, isAbsolute, posix, relative, resolve } from 'node:path';
import type { CodeReviewAnalysisInput, CodeReviewEvidenceContext, CodeReviewEvidenceSnippet } from './code-review-generator';

export const CODE_REVIEW_CONTEXT_LIMITS = Object.freeze({
  maxFileChars: 8_000,
  maxFileBytes: 512_000,
  maxSnippetFiles: 16,
  maxSnippetChars: 40_000,
  maxTreeEntries: 400,
  maxListedFiles: 200,
  maxContextChars: 48_000,
});

const EXCLUDED_DIRECTORIES = new Set(['.aws', '.git', '.gnupg', '.hg', '.ssh', '.svn', 'node_modules', 'vendor', 'dist', 'build', '.next', 'coverage', 'out', 'target', 'bin', 'obj']);
const BINARY_EXTENSIONS = new Set(['.7z', '.avi', '.bmp', '.class', '.dll', '.doc', '.docx', '.exe', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.mov', '.mp3', '.mp4', '.pdf', '.png', '.so', '.tar', '.ttf', '.wav', '.webp', '.woff', '.woff2', '.xls', '.xlsx', '.zip']);
const SENSITIVE_NAMES = new Set(['.netrc', '.npmrc', '.pypirc', 'credentials.json', 'id_dsa', 'id_ed25519', 'id_rsa', 'secrets.json']);
const SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cs', '.css', '.go', '.graphql', '.groovy', '.h', '.hpp', '.html', '.java', '.js', '.jsx', '.kt', '.kts', '.php', '.prisma', '.py', '.rb', '.rs', '.scss', '.sql', '.svelte', '.swift', '.ts', '.tsx', '.vue']);

type DirectoryEntry = { path: string; type: 'file' | 'directory' };
export class CodeReviewContextBuilder {
  async build(root: string, analysis: CodeReviewAnalysisInput): Promise<CodeReviewEvidenceContext> {
    const absoluteRoot = resolve(root);
    const tree = directoryEntries(analysis.directoryTree).filter((entry) => isAllowedPath(entry.path));
    const filePaths = tree.filter((entry) => entry.type === 'file').map((entry) => entry.path).sort(compareText);
    const fileSet = new Set(filePaths);
    const testFiles = filePaths.filter(isTestFile).slice(0, CODE_REVIEW_CONTEXT_LIMITS.maxListedFiles);
    const entryFiles = stringArray(analysis.entryFiles).filter((path) => fileSet.has(path)).sort(compareText).slice(0, CODE_REVIEW_CONTEXT_LIMITS.maxListedFiles);
    const configFiles = filePaths.filter(isReviewConfig).slice(0, CODE_REVIEW_CONTEXT_LIMITS.maxListedFiles);
    const coreModules = recordArray(analysis.coreModules)
      .filter((module) => typeof module.path === 'string' && isAllowedPath(module.path))
      .sort((left, right) => compareText(String(left.path), String(right.path)))
      .slice(0, CODE_REVIEW_CONTEXT_LIMITS.maxListedFiles);
    const corePaths = coreModules.map((module) => String(module.path));
    const candidates = prioritizedCandidates(filePaths, testFiles, entryFiles, configFiles, corePaths);

    const snippets: CodeReviewEvidenceSnippet[] = [];
    let usedSnippetChars = 0;
    for (const path of candidates) {
      if (snippets.length >= CODE_REVIEW_CONTEXT_LIMITS.maxSnippetFiles || usedSnippetChars >= CODE_REVIEW_CONTEXT_LIMITS.maxSnippetChars) break;
      const remaining = CODE_REVIEW_CONTEXT_LIMITS.maxSnippetChars - usedSnippetChars;
      const snippet = await readSnippet(absoluteRoot, path, Math.min(CODE_REVIEW_CONTEXT_LIMITS.maxFileChars, remaining));
      if (!snippet) continue;
      snippets.push(snippet);
      usedSnippetChars += snippet.content.length;
    }

    const prioritizedTree = [...tree]
      .sort((left, right) => treePriority(left, snippets, testFiles, entryFiles, configFiles) - treePriority(right, snippets, testFiles, entryFiles, configFiles) || compareText(left.path, right.path))
      .slice(0, CODE_REVIEW_CONTEXT_LIMITS.maxTreeEntries);
    const context: CodeReviewEvidenceContext = {
      techStack: analysis.techStack,
      directoryTree: prioritizedTree,
      testFiles,
      entryFiles,
      coreModules,
      configFiles,
      snippets,
      evidencePaths: [],
      budget: {
        ...CODE_REVIEW_CONTEXT_LIMITS,
        usedSnippetChars,
        usedContextChars: 0,
      },
    };
    fitContextBudget(context);
    return context;
  }
}

function fitContextBudget(context: CodeReviewEvidenceContext): void {
  refreshContextMetrics(context);
  while (context.budget.usedContextChars > CODE_REVIEW_CONTEXT_LIMITS.maxContextChars) {
    if (context.directoryTree.length > 50) context.directoryTree.pop();
    else if (context.snippets.length > 1) context.snippets.pop();
    else if (context.coreModules.length > 0) context.coreModules.pop();
    else if (context.configFiles.length > 0) context.configFiles.pop();
    else if (context.testFiles.length > 0) context.testFiles.pop();
    else if (context.entryFiles.length > 0) context.entryFiles.pop();
    else if (context.directoryTree.length > 0) context.directoryTree.pop();
    else if (Array.isArray(context.techStack) && context.techStack.length > 0) context.techStack.pop();
    else break;
    refreshContextMetrics(context);
  }
}

function refreshContextMetrics(context: CodeReviewEvidenceContext): void {
  context.evidencePaths = context.snippets.map((snippet) => snippet.path).sort(compareText);
  context.budget.usedSnippetChars = context.snippets.reduce((total, snippet) => total + snippet.content.length, 0);
  context.budget.usedContextChars = serializedLength(context);
  const recalculated = serializedLength(context);
  if (recalculated !== context.budget.usedContextChars) context.budget.usedContextChars = recalculated;
}

async function readSnippet(root: string, path: string, maxChars: number): Promise<CodeReviewEvidenceSnippet | null> {
  if (maxChars <= 0) return null;
  const absolute = resolve(root, ...path.split('/'));
  const child = relative(root, absolute);
  if (!child || child === '..' || child.startsWith(`..\\`) || child.startsWith('../') || isAbsolute(child)) return null;
  try {
    const fileStat = await stat(absolute);
    if (!fileStat.isFile() || fileStat.size > CODE_REVIEW_CONTEXT_LIMITS.maxFileBytes) return null;
    const maxBytes = Math.min(fileStat.size, maxChars * 4);
    const handle = await open(absolute, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.includes(0)) return null;
      const decoded = bytes.toString('utf8');
      if (containsLikelySecret(decoded)) return null;
      const content = decoded.slice(0, maxChars);
      return { path, content, truncated: fileStat.size > bytesRead || decoded.length > maxChars };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

function containsLikelySecret(content: string): boolean {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) return true;
  if (/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i.test(content)) return true;
  return /(?:^|\W)(?:token|api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret|password|private[_-]?key)\s*["']?\s*[:=]\s*["'`][^"'`\r\n]{8,}/im.test(content);
}

function directoryEntries(value: unknown): DirectoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: DirectoryEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.path !== 'string' || (item.type !== 'file' && item.type !== 'directory')) continue;
    const path = normalizePath(item.path);
    if (path) entries.push({ path, type: item.type });
  }
  return entries.sort((left, right) => compareText(left.path, right.path) || compareText(left.type, right.type));
}

function normalizePath(path: string): string | null {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return normalized;
}

function isAllowedPath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  const segments = normalized.toLowerCase().split('/');
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) return false;
  const name = segments.at(-1) ?? '';
  if (name === '.env' || name.startsWith('.env.') || SENSITIVE_NAMES.has(name)) return false;
  if (/(?:^|[._-])(?:secret|secrets|credential|credentials)(?:[._-]|$)/i.test(name)) return false;
  if (/\.(?:key|keystore|p12|pem|pfx)$/i.test(name)) return false;
  return !BINARY_EXTENSIONS.has(extname(name));
}

function isTestFile(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  if (segments.some((segment) => ['test', 'tests', '__tests__', 'spec', 'specs'].includes(segment))) return true;
  const name = posix.basename(path);
  return /\.(?:test|spec)\.[^./]+$/i.test(name) || /(?:Test|Tests|Spec|IT)\.(?:java|kt|kts|groovy)$/i.test(name);
}

function isReviewConfig(path: string): boolean {
  const lower = path.toLowerCase();
  const name = posix.basename(lower);
  return name === 'package.json'
    || name === 'pom.xml' || name === 'pyproject.toml' || name === 'requirements.txt'
    || name === 'go.mod' || name === 'cargo.toml'
    || /^tsconfig(?:\.[^.]+)?\.json$/.test(name)
    || /^(?:vite|vitest|jest|webpack|rollup)\.config\./.test(name)
    || /^(?:build|settings)\.gradle(?:\.kts)?$/.test(name)
    || lower.endsWith('/prisma/schema.prisma') || lower === 'prisma/schema.prisma'
    || name === 'nest-cli.json' || /^next\.config\./.test(name)
    || name === 'dockerfile' || name.startsWith('dockerfile.') || /^docker-compose(?:\.[^.]+)?\.ya?ml$/.test(name)
    || lower.startsWith('.github/workflows/') && /\.ya?ml$/.test(lower)
    || ['.gitlab-ci.yml', 'azure-pipelines.yml', 'jenkinsfile'].includes(name);
}

function prioritizedCandidates(filePaths: string[], tests: string[], entries: string[], configs: string[], corePaths: string[]): string[] {
  const candidates = new Set<string>();
  const add = (paths: string[], limit = paths.length) => paths.slice(0, limit).forEach((path) => candidates.add(path));
  add(configs, 4);
  add(tests, 4);
  add(entries, 3);
  add(filePaths.filter(isHighSignalSource), 8);
  add(filePaths.filter((path) => corePaths.some((corePath) => path === corePath || path.startsWith(`${corePath}/`))), 8);
  add(filePaths.filter((path) => SOURCE_EXTENSIONS.has(extname(path).toLowerCase())));
  return [...candidates];
}

function isHighSignalSource(path: string): boolean {
  const lower = path.toLowerCase();
  return /(?:^|[/.\-_])(?:controller|service|repository|database|db|dao|entity|model|migration|queue|worker|job|processor|consumer|producer|auth|guard|jwt|session|permission)(?:[/.\-_]|$)/.test(lower);
}

function treePriority(entry: DirectoryEntry, snippets: CodeReviewEvidenceSnippet[], tests: string[], entries: string[], configs: string[]): number {
  if (entry.type === 'directory') return 4;
  if (snippets.some((snippet) => snippet.path === entry.path)) return 0;
  if (tests.includes(entry.path)) return 1;
  if (entries.includes(entry.path) || configs.includes(entry.path)) return 2;
  return 3;
}

function serializedLength(value: unknown): number { return JSON.stringify(value).length; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function recordArray(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter(isRecord) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((path) => normalizePath(path)).filter((path): path is string => Boolean(path) && isAllowedPath(path!)) : []; }
