import type { CodeReviewResult } from '@hirescope/shared-types';

interface AnalysisInput { techStack: unknown; coreModules: unknown; statistics: unknown }
export const DETERMINISTIC_CODE_REVIEW_MODEL = 'deterministic-code-review-v1';

export class DeterministicCodeReviewService {
  review(analysis: AnalysisInput): { summary: string; score: number; model: string; result: CodeReviewResult } {
    const techStack = Array.isArray(analysis.techStack) ? analysis.techStack : [];
    const coreModules = Array.isArray(analysis.coreModules) ? analysis.coreModules : [];
    const stats = isRecord(analysis.statistics) ? analysis.statistics : {};
    const totalFiles = numberOrZero(stats.totalFiles); const totalLines = numberOrZero(stats.totalLines);
    const score = Math.max(0, Math.min(100, 68 + Math.min(12, techStack.length * 2) + Math.min(10, coreModules.length * 2) + (totalFiles > 0 ? 5 : 0)));
    const summary = `确定性审查完成：识别 ${techStack.length} 项技术栈、${coreModules.length} 个核心模块，综合评分 ${score}。`;
    return { summary, score, model: DETERMINISTIC_CODE_REVIEW_MODEL, result: {
      overview: `项目包含 ${totalFiles} 个文件、约 ${totalLines} 行代码；本结果基于项目分析元数据生成。`,
      strengths: coreModules.length > 0 ? ['核心模块边界已被识别，便于后续维护。'] : ['项目结构可被确定性分析器读取。'],
      risks: techStack.length > 5 ? ['技术栈较多，需关注依赖升级与兼容性。'] : ['当前审查未读取完整源码，细节风险仍需人工复核。'],
      suggestions: ['补充关键业务路径的自动化测试。', '持续检查依赖、输入校验与错误处理。'],
      maintainability: { score, summary: `基于 ${coreModules.length} 个核心模块评估结构可维护性。` },
      security: { score: Math.max(0, score - 5), summary: '建议持续验证鉴权、资源归属和不可信输入。' },
      performance: { score: Math.min(100, score + 3), summary: '建议通过真实负载测试验证性能瓶颈。' },
    } };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function numberOrZero(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
