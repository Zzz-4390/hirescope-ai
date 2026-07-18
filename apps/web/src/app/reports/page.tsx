import { ArrowRight, CheckCircle2, Download, FileText, Lightbulb, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Logo } from "../../components/Logo";
import { ReportRevealManager } from "../../components/ReportRevealManager";

const skills = [["代码能力",88],["工程能力",84],["项目理解",82],["表达能力",85],["问题思维",87],["学习能力",83]] as const;
const advice = [
  [Star,"优势亮点",["代码结构清晰，模块划分合理","对业务需求理解深入，方案可行","问题排查思路清晰，定位准确"]],
  [TrendingUp,"待提升项",["复杂场景下的系统设计深度","性能优化与扩展性考虑不足","边界条件与异常处理覆盖不全"]],
  [Lightbulb,"优化建议",["加强组件架构与大数据场景实践","完善测试用例，提升代码健壮性","多关注系统设计与工程最佳实践"]],
] as const;

function Radar() { return <svg className="report-radar-svg" viewBox="0 0 260 230" role="img" aria-label="综合能力雷达图"><g fill="none" stroke="#d7e2ef"><polygon points="130,18 220,70 220,158 130,210 40,158 40,70"/><polygon points="130,52 190,87 190,142 130,177 70,142 70,87"/><line x1="130" y1="18" x2="130" y2="210"/><line x1="40" y1="70" x2="220" y2="158"/><line x1="220" y1="70" x2="40" y2="158"/></g><polygon points="130,38 196,83 190,146 130,190 57,151 64,84" fill="rgba(0,102,204,.15)" stroke="#0066cc" strokeWidth="2"/></svg>; }

export default function ReportsPage() {
  return <main className="report-example-page"><ReportRevealManager/>
    <section className="report-hero report-reveal-section is-visible"><div className="report-container report-hero-grid"><div data-report-reveal-item><span>报告示例</span><h1>能力报告，一目了然</h1><p>码途 AI 将项目审查、模拟面试与评估结果整合为结构化报告，帮助你全面了解候选人的真实能力。</p></div><div className="report-preview" data-report-reveal-item><header><div className="sample-avatar">林</div><span><b>智能任务协作平台</b><small>全栈开发工程师<br/>评估完成时间：2026-07-05</small></span><strong>86<em>/100</em></strong></header><div><Radar/><article><b>AI 总结</b><p>候选人具备扎实的工程实现能力，对项目架构和业务逻辑理解到位，能够独立完成复杂模块开发。</p><p>建议在系统设计深度与性能优化方面进一步提升。</p></article></div></div></div></section>
    <section className="report-section report-reveal-section"><div className="report-container" data-report-reveal-item><h2>综合能力概览</h2><div className="ability-overview"><div className="report-score-ring"><strong>86</strong><span>/100</span><b>综合得分</b></div><Radar/><div className="skill-bars">{skills.map(([name,value])=><div key={name}><span>{name}</span><i><b style={{width:`${value}%`}}/></i><em>{value}</em></div>)}</div></div></div></section>
    <section className="report-section report-reveal-section"><div className="report-container" data-report-reveal-item><h2>AI 审查摘要</h2><div className="report-advice-grid">{advice.map(([Icon,title,items],index)=><article key={title} className={`advice-${index}`}><h3><Icon/>{title}</h3><ul>{items.map(item=><li key={item}>{item}</li>)}</ul></article>)}</div></div></section>
    <section className="report-section report-reveal-section"><div className="report-container" data-report-reveal-item><h2>模拟面试表现</h2><div className="interview-performance"><article><b>AI 面试官对话摘要</b><p><strong>AI 面试官</strong>请介绍一下项目中最有挑战的技术难点，以及你是如何解决的？</p><p><strong>候选人</strong>最大的挑战是任务调度中的资源冲突，通过引入限流队列和重试策略，确保任务稳定执行。</p><p><strong>AI 面试官</strong>如果需要支撑更高并发流量，你会如何设计系统扩展？</p><Link href="/process">查看完整对话 <ArrowRight/></Link></article><div className="interview-metrics">{[["回答完整度",88],["技术理解",85],["表达清晰度",86],["追问应对",83]].map(([name,value])=><div key={name}><small>{name}</small><strong>{value}<em>/100</em></strong></div>)}</div></div></div></section>
    <section className="report-section report-reveal-section"><div className="report-container" data-report-reveal-item><h2>改进建议与导出</h2><div className="report-export-grid"><article><b>改进建议清单</b>{["深入学习分布式系统设计，提升架构设计能力","加强缓存优化实践，关注系统瓶颈分析与调优","完善测试流程，提升代码覆盖率与用例质量","参与开源项目，提升工程化与协作能力","持续学习新技术，保持技术敏感度"].map(item=><p key={item}><CheckCircle2/>{item}</p>)}</article><article><b>导出完整报告</b><FileText/><span>包含评估详情、面试对话与改进建议<Link href="#">导出 PDF 报告 <Download/></Link></span></article></div></div></section>
    <section className="report-bottom report-reveal-section"><div className="report-container"><div className="report-cta" data-report-reveal-item><div><h2>想看看你的项目能力报告吗？</h2><p>上传项目或完成模拟面试，码途 AI 为你生成专属能力报告。</p></div><Link href="/login">立即体验 <ArrowRight/></Link><Link href="/process">查看使用流程 <ArrowRight/></Link></div><footer className="report-footer"><div><Logo/><p>让项目能力被看见，让优秀人才脱颖而出。</p></div><dl><div><dt>产品</dt><dd>产品能力</dd><dd>使用流程</dd><dd>报告示例</dd></div><div><dt>资源</dt><dd>帮助中心</dd><dd>常见问题</dd><dd>更新日志</dd></div><div><dt>关于我们</dt><dd>关于码途 AI</dd><dd>联系我们</dd><dd>加入我们</dd></div></dl><small>© 2026 码途 AI · HireScope AI</small></footer></div></section>
  </main>;
}
