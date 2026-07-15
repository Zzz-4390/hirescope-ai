import type { CodeReviewResult } from '@hirescope/shared-types';
import type { CodeReviewAnalysisInput, CodeReviewEvidenceContext } from './code-review-generator';

export const DETERMINISTIC_CODE_REVIEW_MODEL = 'deterministic-code-review-v1';

export class DeterministicCodeReviewService {
  review(analysis: CodeReviewAnalysisInput, _generationContext?: unknown, evidence?: CodeReviewEvidenceContext): { summary: string; score: number; model: string; result: CodeReviewResult } {
    const techStack = Array.isArray(analysis.techStack) ? analysis.techStack : [];
    const coreModules = Array.isArray(analysis.coreModules) ? analysis.coreModules : [];
    const stats = isRecord(analysis.statistics) ? analysis.statistics : {};
    const totalFiles = numberOrZero(stats.totalFiles); const totalLines = numberOrZero(stats.totalLines);
    const score = Math.max(0, Math.min(100, 68 + Math.min(12, techStack.length * 2) + Math.min(10, coreModules.length * 2) + (totalFiles > 0 ? 5 : 0)));
    const summary = `确定性审查完成：识别 ${techStack.length} 项技术栈、${coreModules.length} 个核心模块，综合评分 ${score}。`;
    const primaryPath = evidence?.entryFiles[0] ?? evidence?.snippets.find((snippet) => !evidence.configFiles.includes(snippet.path) && !evidence.testFiles.includes(snippet.path))?.path ?? evidence?.configFiles[0] ?? evidence?.evidencePaths[0];
    const testPath = evidence?.testFiles.find((path) => evidence.evidencePaths.includes(path));
    const strengths = testPath
      ? [`[${testPath}] 已识别并纳入测试文件证据。`]
      : primaryPath ? [`[${primaryPath}] 已纳入受控审查上下文，可作为后续人工复核入口。`] : [];
    const risks = primaryPath ? [`[${primaryPath}] 本次仅读取有预算限制的代表性片段，未覆盖的实现细节需要人工复核。`] : [];
    const suggestions = primaryPath ? [`[${primaryPath}] 建议围绕该真实文件继续核对关键业务路径、输入校验和错误处理。`] : [];
    return { summary, score, model: DETERMINISTIC_CODE_REVIEW_MODEL, result: {
      overview: `项目包含 ${totalFiles} 个文件、约 ${totalLines} 行代码；本结果基于受控项目证据生成。`,
      strengths,
      risks,
      suggestions,
      maintainability: { score, summary: `基于 ${coreModules.length} 个核心模块和受控文件证据评估结构可维护性。` },
      security: { score: Math.max(0, score - 5), summary: '现有证据不足以断言具体安全缺陷，需要结合代表性文件人工复核。' },
      performance: { score: Math.min(100, score + 3), summary: '现有证据不足以断言具体性能瓶颈，需要通过真实负载验证。' },
    } };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function numberOrZero(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
