import {
  ArrowRight, Bot, Check, CircleUserRound,
  CloudUpload, Code2, FileSearch, FileText, MessageSquare, Send, ShieldCheck,
  Sparkles, Star, Target, TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { Reveal } from "../components/Reveal";
import { HomeRevealManager } from "../components/HomeRevealManager";

const capabilities = [
  { icon: CloudUpload, title: "上传项目", text: "支持 Git 仓库或压缩包" },
  { icon: Sparkles, title: "AI 分析", text: "多维度智能分析" },
  { icon: Code2, title: "代码审查", text: "发现问题与改进建议" },
  { icon: MessageSquare, title: "模拟面试", text: "AI 智能提问与追问" },
  { icon: FileText, title: "面试报告", text: "整合评估与建议" },
  { icon: Send, title: "分享授权", text: "一键分享与授权查看" },
];

const roles = [
  { icon: CircleUserRound, title: "求职者 / 学生", subtitle: "展示项目能力，获得专业反馈。", items: ["快速获得能力评估", "分享报告提升竞争力"] },
  { icon: Target, title: "面试官 / 评审者", subtitle: "高效评估项目，辅助面试决策。", items: ["审查项目与代码质量", "结构化报告辅助决策"] },
  { icon: ShieldCheck, title: "管理员 / 平台方", subtitle: "统一管理评估流程与标准。", items: ["集中管理项目流程", "数据分析驱动优化"] },
];

const flow = [
  { icon: CloudUpload, title: "上传项目", text: "提交代码仓库" },
  { icon: Sparkles, title: "AI 分析", text: "识别技术能力" },
  { icon: Code2, title: "代码审查", text: "定位改进空间" },
  { icon: MessageSquare, title: "模拟面试", text: "智能提问追问" },
  { icon: FileText, title: "报告生成", text: "整合评估结果" },
  { icon: Send, title: "分享授权", text: "安全分享报告" },
];

function ProductPreview() {
  return (
    <div className="laptop" aria-label="码途 AI 项目审查产品界面示意">
      <div className="laptop-screen">
        <aside><strong>项目审查</strong><span>概览</span><b>我的项目</b><small>项目</small><b className="selected">src</b><span>components</span><span>pages</span><span>hooks</span><span>App.tsx</span></aside>
        <div className="preview-main"><h3>项目审查</h3><div className="preview-tabs">代码质量　 安全风险　 性能　 可维护性</div><code>src / components / UserList.tsx</code><pre>{`const UserList = ({ users }) => {\n  const [selected, setSelected] = useState();\n\n  return users.map(user => (\n    <UserCard key={user.id} />\n  ));\n};`}</pre></div>
        <div className="preview-results"><strong>AI 审查结果</strong><article><i />代码质量问题<small>发现 2 处潜在问题，建议优化</small></article><article><i />最佳实践建议<small>提升代码规范性与可维护性</small></article><article><i />可维护性优化<small>建议抽象并拆分重复逻辑</small></article></div>
      </div>
      <div className="laptop-base" />
    </div>
  );
}

function ScorePanel() {
  return (
    <div className="score-panel">
      <div className="score-overview"><span>综合评分</span><strong>86<small>/100</small></strong><em>表现优秀</em><p>超过 86% 的候选人</p><div className="radar-shape" /></div>
      <div className="score-bars"><strong>维度得分</strong>{[["代码质量",18],["架构设计",17],["工程实践",16],["功能实现",18],["文档与测试",17]].map(([name,value]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{width:`${Number(value)*5}%`}} /></i><small>{value}/20</small></div>)}<article><strong>AI 评审总结</strong><p>项目整体设计清晰，模块划分合理，核心功能实现完整，代码规范性较好。</p><a>查看完整报告 <ArrowRight /></a></article></div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="home-page">
      <HomeRevealManager />
      <section className="hero-section snap-section"><Reveal><div className="hero-grid"><div className="hero-copy"><h1>让项目能力被看见</h1><p>码途 AI（HireScope AI）通过 AI 项目审查、模拟面试与能力报告，帮助求职者更好展示自己，帮助面试官更科学评估候选人。</p><div className="hero-buttons"><Link className="primary-button" href="/app">立即体验 <ArrowRight /></Link><Link className="secondary-button" href="/reports">查看报告示例 <ArrowRight /></Link></div></div><ProductPreview /></div></Reveal><div className="capability-strip">{capabilities.map(({icon:Icon,title,text}) => <div key={title}><Icon/><span><strong>{title}</strong><small>{text}</small></span></div>)}</div></section>

      <section className="roles-section snap-section"><div className="screen-content"><Reveal><div className="center-heading"><h2>面向不同角色，按需体验</h2><p>覆盖求职展示、专业评审与平台管理，让每一种评估更清晰、更高效。</p></div><div className="role-grid">{roles.map(({icon:Icon,title,subtitle,items}) => <article className="role-card" key={title}><div className="role-title"><i><Icon/></i><span><h3>{title}</h3><p>{subtitle}</p></span></div><ul>{items.map(item=><li key={item}><Check/>{item}</li>)}</ul></article>)}</div></Reveal><Reveal><div className="flow-block"><div className="center-heading"><h2>核心流程，简单六步完成评估</h2><p>从项目提交到报告生成，六个步骤完成专业评估。</p></div><div className="flow-grid">{flow.map(({icon:Icon,title,text},index)=><div className="flow-item" key={title}><span className="step">{index+1}</span><Icon/><h3>{title}</h3><p>{text}</p>{index<flow.length-1?<ArrowRight className="flow-arrow"/>:null}</div>)}</div></div></Reveal></div></section>

      <section className="features-section snap-section"><div className="screen-content"><Reveal><header className="feature-hero"><h2>核心能力，逐步展开</h2><p>深入项目审查与模拟面试，让评估结果更准确、更有依据。</p></header><div className="feature-row"><div className="feature-copy"><div className="feature-heading"><i><Code2/></i><div><h2>AI 项目审查</h2><p>自动解析项目代码与文档，从代码质量、架构设计和工程实践等维度形成结构化结论。</p></div></div><div className="feature-summary"><span>多维评估体系</span><span>智能图表分析</span><span>AI 洞察总结</span></div></div><ScorePanel /></div><div className="interview-row"><div className="interview-mock"><div><Bot/> 模拟面试进行中 <b>08:45</b></div><p>请介绍一下你在这个项目中承担的核心职责和技术选型思路。</p><div className="waveform">||||||||||||||||||||||||||||||||</div></div><div className="feature-copy"><div className="feature-heading"><i><MessageSquare/></i><div><h2>AI 模拟面试</h2><p>基于项目内容动态生成问题链，通过智能追问评估技术深度与表达能力。</p></div></div><div className="feature-summary"><span>个性化问题链</span><span>实时智能追问</span></div></div></div></Reveal></div></section>

      <section className="report-section snap-section"><Reveal><div className="report-heading"><span>报告示例</span><h2>能力报告，一目了然</h2><p>从多维度科学评估候选人能力，结合 AI 洞察与建议，帮助你更全面地了解人才。</p></div><div className="report-card"><div className="candidate-score"><div className="score-ring"><strong>86</strong><small>/100</small></div><p>超过 85% 的同岗位候选人</p><hr/><div className="candidate"><CircleUserRound/><span><strong>张一鸣</strong><small>高级前端工程师</small></span></div></div><div className="report-radar"><h3>能力维度</h3><div className="radar-large"><span>专业技能　88</span><b>代码质量　82</b><em>问题解决　85</em><i>工程实践　84</i></div></div><div className="insights"><h3><Star/> 优势亮点</h3><p><Check/> 算法与数据结构扎实，复杂问题分析能力强</p><p><Check/> 代码规范性好，注重可维护性与可扩展性</p><hr/><h3 className="improvement-title"><Target/> 待提升项</h3><p>大型项目架构设计方面经验较少</p><p>跨团队沟通时表达不够结构化</p></div><div className="suggestions"><h3><Sparkles/> AI 建议</h3>{[[CircleUserRound,"岗位匹配度","与目标岗位匹配度高，具备胜任核心能力。"],[TrendingUp,"发展潜力","具备较强学习能力和技术深度。"],[FileSearch,"面试建议","重点考察大型项目架构经验。"]].map(([Icon,title,text])=><article key={String(title)}><Icon/><div><strong>{String(title)}</strong><p>{String(text)}</p></div></article>)}</div></div><div className="report-cta"><FileSearch/><span><strong>想查看更多真实报告示例？</strong><small>覆盖多种岗位与场景，帮助你更直观地了解评估维度与输出内容。</small></span><Link className="report-cta-link" href="/reports">查看报告示例 <ArrowRight/></Link></div></Reveal><footer className="home-footer"><div className="footer-brand">码途 AI <small>HireScope AI</small></div><div>关于我们　　隐私政策　　服务条款　　联系我们</div><span>© 2026 HireScope AI. 保留所有权利。</span></footer></section>
    </main>
  );
}
