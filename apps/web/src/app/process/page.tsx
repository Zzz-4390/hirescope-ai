import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Clock3,
  CloudUpload,
  Code2,
  FileCheck2,
  FileText,
  Folder,
  GitBranch,
  Link2,
  LockKeyhole,
  MessageCircleMore,
  SearchCode,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import { Logo } from "../../components/Logo";
import { ProcessRevealManager } from "../../components/ProcessRevealManager";
import { SiteHeader } from "../../components/SiteHeader";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const overviewSteps: Array<[Icon, string, string]> = [
  [CircleUserRound, "01", "注册登录"],
  [CloudUpload, "02", "上传项目"],
  [BrainCircuit, "03", "AI 分析"],
  [Code2, "04", "代码审查"],
  [MessageCircleMore, "05", "模拟面试"],
  [FileText, "06", "能力报告"],
  [Share2, "07", "分享授权"],
];

const processHighlights: Array<[Icon, string, string]> = [
  [Clock3, "流程透明", "7 步完成评估"],
  [Sparkles, "智能驱动", "AI 全程赋能"],
  [GitBranch, "结果可验证", "依据可追溯"],
  [ShieldCheck, "权限可控", "保护项目数据"],
];

function FeatureChecks({ items }: { items: string[] }) {
  return (
    <ul className="process-checks">
      {items.map((item) => <li key={item}><CheckCircle2 />{item}</li>)}
    </ul>
  );
}

function SectionCopy({ number, label, title, description, items }: {
  number: string;
  label: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="process-section-copy" data-process-reveal-item>
      <span>{number}　{label}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <FeatureChecks items={items} />
    </div>
  );
}

function UploadMockup() {
  return (
    <div className="process-window upload-mockup">
      <div className="mock-tabs"><b>ZIP 上传</b><span>GitHub 导入</span></div>
      <div className="upload-body">
        <div className="drop-zone"><CloudUpload /><strong>将项目 ZIP 文件拖到此处</strong><small>支持 .zip，文件不超过 500MB</small></div>
        <div className="project-fields">
          <label>项目名称<span>HireScope Demo</span></label>
          <label>项目描述<span>AI 项目审查与模拟面试平台</span></label>
          <label>技术栈（自动识别）<span className="tech-tags"><i>Next.js</i><i>TypeScript</i><i>NestJS</i><i>PostgreSQL</i></span></label>
          <label>目标岗位<span>全栈开发工程师</span></label>
        </div>
      </div>
      <footer><span><ShieldCheck />自动安全扫描</span><span><LockKeyhole />仅用于能力评估</span><button type="button">开始分析</button></footer>
    </div>
  );
}

function ReviewMockup() {
  const code = [
    "export async function analyzeProject() {",
    "  const files = await scanWorkspace();",
    "  return reviewModules(files);",
    "}",
  ];
  return (
    <div className="process-window review-mockup">
      <aside><strong>项目结构</strong>{["src", "components", "services", "lib", "tests"].map((item, index) => <span key={item}><Folder />{item}{index === 0 && <small>12</small>}</span>)}</aside>
      <div className="review-code"><header>src / analysis / project.ts</header><pre>{code.map((line, index) => <code key={line}><i>{index + 1}</i>{line}</code>)}</pre><div className="review-summary"><b><Sparkles />AI 审查摘要</b><span>目录职责清晰，模块边界完整，建议补充异常分支测试。</span><span>检测到 3 项可维护性优化建议。</span></div></div>
      <div className="review-result"><small>AI 审查结果</small><strong>84<em>/100</em></strong><b>良好</b><hr/><h4>优势</h4><p>项目结构清晰</p><p>核心模块明确</p><h4 className="warning">待改进</h4><p>补充边界校验</p><p>完善错误处理</p></div>
    </div>
  );
}

function InterviewMockup() {
  return (
    <div className="process-window interview-mockup">
      <div className="interview-chat"><header><Bot />AI 面试官</header><p className="question">在你的项目中，为什么选择 Redis 处理任务状态？</p><p className="answer">项目采用异步任务架构，Redis 适合高并发状态读写，也便于任务恢复。</p><p className="question">如果 Redis 服务短暂中断，你会如何保证可用性？</p><p className="typing">•••</p><footer>面试进行中，AI 正在生成下一轮追问…</footer></div>
      <aside><small>面试进度</small><strong>5 <em>/ 8</em></strong><i><b /></i><small>整体评分</small><div className="score-ring"><strong>78</strong><span>/100</span></div><ul><li>项目理解 <b>18/20</b></li><li>技术深度 <b>16/20</b></li><li>解决问题 <b>15/20</b></li><li>工程思维 <b>15/20</b></li></ul></aside>
    </div>
  );
}

function ReportMockup() {
  return (
    <div className="process-window report-mockup">
      <div className="report-score"><small>综合评分</small><strong>86<em>/100</em></strong><b>优秀</b><p>超过 82% 的候选人，技术实现与工程能力表现突出。</p></div>
      <div className="report-radar"><small>能力雷达</small><svg viewBox="0 0 260 230" role="img" aria-label="能力雷达图"><g fill="none" stroke="#d5e1ef"><polygon points="130,20 220,72 220,158 130,210 40,158 40,72"/><polygon points="130,52 190,87 190,143 130,178 70,143 70,87"/><line x1="130" y1="20" x2="130" y2="210"/><line x1="40" y1="72" x2="220" y2="158"/><line x1="220" y1="72" x2="40" y2="158"/></g><polygon points="130,42 196,84 190,145 130,188 58,151 65,86" fill="rgba(0,102,204,.16)" stroke="#0066cc" strokeWidth="2"/></svg></div>
      <div className="report-notes"><small>AI 总结</small><p>技术深度、工程实现和问题解决表现突出，具备独立推进项目落地的能力。</p><h4>优点</h4><ul><li>架构设计清晰</li><li>代码质量良好</li><li>工程化思维完整</li></ul><h4 className="warning">改进建议</h4><ul><li>补充性能验证</li><li>强化项目管理经验</li></ul><button type="button"><FileText />导出 PDF 报告</button></div>
    </div>
  );
}

function ShareMockup() {
  return (
    <div className="process-window share-mockup">
      <label>面试官邮箱<span>interviewer@company.com</span></label>
      <strong>内容权限</strong><div className="permission-grid">{["基础信息", "评估报告", "代码评测", "沟通记录", "AI 建议"].map((item) => <span key={item}><Check />{item}</span>)}</div>
      <strong>有效期</strong><div className="expiry"><span>○　7 天</span><span className="selected">●　30 天</span><span>○　永久有效</span></div>
      <strong>分享链接（已生成）</strong><div className="share-link"><span>https://hirescope.ai/share/abc123def</span><button type="button"><Link2 />复制链接</button></div>
      <small>只有获得授权的用户可以通过该链接访问，权限可随时撤销。</small>
    </div>
  );
}

export default function ProcessPage() {
  return (
    <><SiteHeader /><main className="process-page"><ProcessRevealManager />
      <section className="process-hero process-reveal-section is-visible">
        <div className="process-container process-hero-grid">
          <div className="process-hero-copy" data-process-reveal-item><span>使用流程</span><h1>从上传项目到生成报告，<br/>清晰走完整个评估流程</h1><p>码途 AI 通过项目解析、智能分析、代码审查与模拟面试，把真实项目转化为可验证、可分享的能力证明。</p><div className="process-highlights">{processHighlights.map(([IconComponent, title, text]) => <div key={title}><IconComponent/><span><b>{title}</b><small>{text}</small></span></div>)}</div></div>
          <div className="overview-track" data-process-reveal-item data-process-reveal-delay="2">{overviewSteps.map(([IconComponent, number, label]) => <div key={number}><IconComponent/><b>{number}</b><span>{label}</span></div>)}</div>
        </div>
      </section>

      <section className="process-section process-reveal-section"><div className="process-container process-two-column"><SectionCopy number="01" label="上传与解析" title="从项目开始，建立你的技术画像" description="上传 ZIP 项目或导入 GitHub 仓库，系统自动完成安全扫描、目录解析和技术栈识别。" items={["ZIP / GitHub 导入", "项目命名与描述", "技术栈识别", "目标岗位匹配", "目录结构解析", "自动安全扫描"]}/><div data-process-reveal-item data-process-reveal-delay="2"><UploadMockup /></div></div></section>

      <section className="process-section process-section-tint process-reveal-section"><div className="process-container process-two-column"><SectionCopy number="02" label="AI 分析与代码审查" title="识别项目结构，并生成审查结论" description="AI 分块读取关键文件，分析模块职责、代码质量和风险点，输出有依据的改进建议。" items={["技术栈识别", "目录结构分析", "核心模块提取", "代码质量审查", "风险识别", "优化建议"]}/><div data-process-reveal-item data-process-reveal-delay="2"><ReviewMockup /></div></div></section>

      <section className="process-section process-reveal-section"><div className="process-container process-two-column"><SectionCopy number="03" label="AI 模拟面试" title="围绕你的项目，进行真实追问" description="根据项目背景、技术选型和核心模块生成递进问题，模拟真实技术面试过程。" items={["项目背景", "技术选型", "核心模块", "数据库设计", "项目难点", "优化方案"]}/><div data-process-reveal-item data-process-reveal-delay="2"><InterviewMockup /></div></div></section>

      <section className="process-section process-section-tint process-reveal-section"><div className="process-container process-two-column"><SectionCopy number="04" label="查看能力报告" title="把项目表现，转化为清晰的能力报告" description="将代码审查和面试表现整合为多维能力评价，明确优势、不足与下一步改进方向。" items={["综合评分", "能力雷达", "优点分析", "不足分析", "改进建议", "PDF 导出"]}/><div data-process-reveal-item data-process-reveal-delay="2"><ReportMockup /></div></div></section>

      <section className="process-section process-reveal-section"><div className="process-container process-two-column"><SectionCopy number="05" label="分享授权" title="分享给面试官，但权限始终由你掌控" description="为指定面试官生成安全链接，按内容和有效期精细授权，随时可以撤销。" items={["指定面试官", "分享链接", "内容权限", "有效期设置", "访问控制", "撤销授权"]}/><div data-process-reveal-item data-process-reveal-delay="2"><ShareMockup /></div></div></section>

      <section className="process-closure process-reveal-section"><div className="process-container"><div className="closure-heading" data-process-reveal-item><span>完整评估闭环</span><h2>一次项目提交，形成可持续提升的能力闭环</h2><p>项目输入、AI 评估、针对性面试、能力报告和安全分享彼此衔接，每一步都有依据、每次改进都可追踪。</p></div><div className="closure-flow" data-process-reveal-item data-process-reveal-delay="2">{[[CloudUpload,"项目输入"],[SearchCode,"结构解析"],[BrainCircuit,"智能评估"],[Target,"改进建议"],[FileCheck2,"报告沉淀"],[Send,"授权分享"]].map(([IconComponent,label],index) => { const StepIcon=IconComponent as Icon; return <div key={label as string}><i><StepIcon/></i><b>{label as string}</b>{index < 5 && <ArrowRight/>}</div>; })}</div></div></section>

      <section className="process-bottom process-reveal-section"><div className="process-container process-bottom-grid"><div className="process-faq" data-process-reveal-item><h3>常见问题</h3>{["支持 GitHub 仓库或代码仓库吗？","AI 评估题会重复吗？","模拟面试可以重新进行吗？","报告可以导出或对外分享吗？"].map((item) => <div key={item}>{item}<ChevronDown /></div>)}</div><div className="process-cta" data-process-reveal-item data-process-reveal-delay="2"><div><h2>准备开始你的第一次项目能力评估了吗？</h2><p>只需上传项目，即可获得专业的 AI 评估报告，让你的技术能力被更准确地看见。</p><span><Link href="/login">立即体验 <ArrowRight /></Link><button type="button">查看报告示例 <ArrowRight /></button></span></div><div className="cta-art"><BarChart3/><FileText/><ShieldCheck/></div></div></div><footer className="process-footer"><div><Logo/><p>让每一次技术评估，更客观、更高效、更有价值。</p></div><dl><div><dt>产品</dt><dd>产品能力</dd><dd>使用流程</dd><dd>报告示例</dd></div><div><dt>资源</dt><dd>帮助中心</dd><dd>常见问题</dd><dd>隐私与安全</dd></div><div><dt>关于我们</dt><dd>关于码途 AI</dd><dd>联系我们</dd><dd>加入我们</dd></div></dl><small>© 2026 码途 AI · HireScope AI</small></footer></section>
    </main></>
  );
}
