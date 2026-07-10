import type { InterviewQuestionsResult } from '@hirescope/shared-types'; import type { InterviewDifficulty } from '@prisma/client';
import type { InterviewAnalysisInput } from './interview-question-generator';
const TEMPLATES = [
  ['architecture', '请说明项目的整体架构以及模块边界。', ['说明主要层次', '说明模块职责', '说明依赖方向']],
  ['implementation', '请选择一个核心模块，说明其实现思路。', ['说明输入输出', '说明核心流程', '说明异常处理']],
  ['testing', '这个项目的关键业务路径应如何测试？', ['单元测试', '集成测试', '边界场景']],
  ['security', '项目如何处理鉴权、资源归属和不可信输入？', ['身份校验', '资源归属', '输入验证']],
  ['performance', '项目可能出现哪些性能瓶颈，如何验证？', ['定位瓶颈', '测量指标', '优化取舍']],
  ['maintainability', '如何降低项目后续迭代的维护成本？', ['清晰命名', '模块解耦', '自动化检查']],
  ['database', '数据模型如何保证一致性和用户隔离？', ['数据库约束', '事务边界', '用户隔离']],
  ['async', '异步任务如何保证重试安全和幂等？', ['稳定任务标识', '状态机', '重复消费']],
  ['observability', '线上故障时需要记录哪些可观测信息？', ['结构化日志', '请求标识', '错误分类']],
  ['deployment', '从开发环境发布到生产环境需要哪些检查？', ['配置管理', '迁移策略', '回滚方案']],
  ['dependencies', '如何管理依赖升级及兼容性风险？', ['版本策略', '安全更新', '回归测试']],
  ['api', 'API 设计如何保持稳定且便于扩展？', ['契约设计', '错误响应', '版本兼容']],
  ['concurrency', '并发请求可能导致哪些竞态，如何防止？', ['锁或约束', '原子事务', '冲突响应']],
  ['quality', '你会用哪些工程手段持续保证代码质量？', ['类型检查', '代码审查', '持续集成']],
  ['tradeoff', '请举例说明本项目中的一个技术取舍。', ['备选方案', '决策依据', '后续演进']],
] as const;
export class DeterministicInterviewQuestionService {
  generate(analysis: InterviewAnalysisInput, latestReview: unknown, questionCount: number, difficulty: InterviewDifficulty): InterviewQuestionsResult {
    const stack = Array.isArray(analysis.techStack) ? analysis.techStack : []; const modules = Array.isArray(analysis.coreModules) ? analysis.coreModules : [];
    return { questions: Array.from({ length: questionCount }, (_, index) => { const template = TEMPLATES[index % TEMPLATES.length]!; const context = index === 0 ? ` 已识别 ${stack.length} 项技术栈和 ${modules.length} 个核心模块。` : latestReview && index === 1 ? ' 请结合最近一次代码审查结果。' : ''; return { sequence: index + 1, category: template[0], difficulty, question: `${template[1]}${context}`, referencePoints: [...template[2]] }; }) };
  }
}
