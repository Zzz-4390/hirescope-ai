import {
  Activity,
  ArrowRight,
  Boxes,
  CalendarClock,
  Check,
  CircleUserRound,
  ClipboardCheck,
  CloudUpload,
  Code2,
  Database,
  FileCode2,
  FileText,
  FolderGit2,
  Gauge,
  Github,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  MessageSquare,
  Network,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Upload,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import { CapabilitiesRevealManager } from "../../components/CapabilitiesRevealManager";
import { Logo } from "../../components/Logo";
import { SiteHeader } from "../../components/SiteHeader";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const HERO_TITLE = "从项目审查到能力报告，形成完整评估闭环";

const heroBenefits = [
  { icon: ClipboardCheck, title: "全面数据评估", text: "一站式评估" },
  { icon: Sparkles, title: "AI 深度分析", text: "多维度洞察" },
  { icon: ShieldCheck, title: "标准化报告", text: "客观可对比" },
  { icon: LockKeyhole, title: "安全可控", text: "灵活授权" },
];

const processSteps = [
  { icon: CloudUpload, title: "项目上传\n与解析" },
  { icon: Code2, title: "AI 项目\n审查" },
  { icon: MessageSquare, title: "AI 模拟\n面试" },
  { icon: FileText, title: "能力报告\n生成" },
  { icon: Upload, title: "分享\n授权" },
  { icon: UsersRound, title: "面试官\n与管理" },
];

const sections = {
  upload: [
    [Upload, "ZIP 上传", "支持本地项目压缩包"],
    [FolderGit2, "目录结构分析", "智能解析项目组织"],
    [Github, "GitHub 仓库导入", "一键导入公开或私有仓库"],
    [Boxes, "核心模块提取", "提取关键模块与入口文件"],
    [Code2, "技术栈识别", "自动识别项目技术栈"],
    [FileText, "README 解析", "理解项目说明与运行方式"],
  ],
  review: [
    [FileCode2, "代码结构", ""], [Activity, "可维护性", ""], [Gauge, "性能问题", ""],
    [Network, "安全风险", ""], [RotateCcw, "异常处理", ""], [ClipboardCheck, "工程规范", ""],
  ],
  interview: [
    [LayoutDashboard, "项目理解", ""], [Code2, "技术深度", ""], [MessageSquare, "核心追问", ""],
    [Database, "数据驱动", ""], [Target, "项目重点", ""], [Sparkles, "优化方案", ""],
  ],
  report: [
    [ShieldCheck, "综合评分", ""], [Network, "维度评估", ""], [FileText, "AI 总结", ""],
    [Star, "优点亮点", ""], [Target, "不足分析", ""], [ClipboardCheck, "改进建议", ""],
  ],
} satisfies Record<string, [Icon, string, string][]>;

function FeatureList({ items }: { items: [Icon, string, string][] }) {
  return (
    <div className="cap-feature-list" data-cap-reveal-item data-cap-reveal-delay="2">
      {items.map(([IconComponent, title, text]) => (
        <div className="cap-feature" key={title}>
          <i><IconComponent /></i>
          <span><strong>{title}</strong>{text ? <small>{text}</small> : null}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCopy({ number, label, title, description, features }: {
  number: string; label: string; title: string; description: string; features: [Icon, string, string][];
}) {
  return (
    <div className="cap-section-copy">
      <span className="cap-section-number" data-cap-reveal-item>{number} {label}</span>
      <h2 data-cap-reveal-item data-cap-reveal-delay="1">{title}</h2>
      <p data-cap-reveal-item data-cap-reveal-delay="2">{description}</p>
      <FeatureList items={features} />
    </div>
  );
}

function ProjectOverview() {
  return (
    <div className="product-window project-window">
      <div className="window-sidebar">
        <strong><LayoutDashboard /> 项目概览</strong>
        {[[FolderGit2,"文件结构"],[Boxes,"技术栈"],[FileCode2,"依赖分析"],[Target,"核心模块"],[FileText,"README"]].map(([IconComponent,label]) => {
          const SidebarIcon = IconComponent as Icon;
          return <span key={String(label)}><SidebarIcon />{String(label)}</span>;
        })}
      </div>
      <div className="project-summary">
        <header>项目概览</header>
        <div className="project-body">
          <div>
            <h3><Boxes /> 智能图像分类系统 v1.2.0 <em>解析完成</em></h3>
            <dl><div><dt>项目类型</dt><dd>Python Web 应用</dd></div><div><dt>项目大小</dt><dd>12.4 MB</dd></div><div><dt>文件数量</dt><dd>428 个文件</dd></div><div><dt>来源</dt><dd>GitHub 导入</dd></div></dl>
          </div>
          <div className="project-tech"><strong>技术栈识别</strong><div>{["Python","Django","PyTorch","NumPy","OpenCV","scikit-learn","Docker","Redis","PostgreSQL","Nginx"].map(item => <span key={item}>{item}</span>)}</div><strong>核心模块</strong><pre>{`▰ src/\n▰ models/\n▰ services/\n▰ api/\n▰ utils/`}</pre></div>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel() {
  return (
    <div className="product-window review-window">
      <aside><strong>项目概览</strong>{["src/","models/","resnet_model.py","train.py","utils.py","services/","api/","requirements.txt"].map(item => <span className={item === "resnet_model.py" ? "selected" : ""} key={item}>{item}</span>)}</aside>
      <div className="code-pane"><small>resnet_model.py</small><pre><code>{`class ResNet(nn.Module):\n  def __init__(self, block, layers):\n    super().__init__()\n    self.in_channels = 64\n    self.conv1 = nn.Conv2d(...)\n    self.layer1 = self._make_layer(...)\n\n  def forward(self, x):\n    return self.fc(x)`}</code></pre></div>
      <div className="review-score"><span>质量评分</span><strong>82<small>/100</small></strong><em>良好</em>{[["严重问题",2],["主要问题",5],["建议优化",6],["代码规范",12]].map(([name,value]) => <p key={name}><i />{name}<b>{value}</b></p>)}</div>
      <div className="review-advice"><strong>AI 建议</strong><p>建议将模型层的 <code>num_classes</code> 参数抽象为配置项，提升复用性。</p><p>建议为 <code>_make_layer</code> 方法补充类型声明与文档。</p><p>建议增加重要代码路径的边界测试。</p></div>
    </div>
  );
}

function InterviewPanel() {
  return (
    <div className="product-window interview-window">
      <aside><strong>面试进度</strong>{["项目理解","技术追问","核心模块","数据驱动","项目重点","优化方案"].map((item,index) => <span className={index === 1 ? "active" : ""} key={item}><i>{index < 2 ? "✓" : index + 1}</i>{item}</span>)}<small>共 6/6 题</small></aside>
      <div className="chat-pane"><strong>AI 面试官</strong><div className="chat question"><CircleUserRound />你在项目中使用了 ResNet 作为特征提取网络，为什么选择 ResNet 而不是其他模型？</div><div className="chat answer">因为 ResNet 的残差结构可以缓解深层网络训练中的梯度消失问题，同时在我们的数据集上取得了更稳定的结果。</div><div className="chat question"><CircleUserRound />在训练过程中，你如何处理过拟合问题？</div><div className="chat-input">请输入你的回答… <Send /></div></div>
      <div className="interview-score"><strong>面试评分</strong>{[["回答质量",86],["逻辑完整",82],["表达清晰度",88],["模拟性",83]].map(([name,value]) => <div key={name}><span>{name}<b>{value}%</b></span><i><em style={{width:`${value}%`}} /></i></div>)}<p>综合评价</p><div className="stars">★★★★<span>★</span> <em>优秀</em></div></div>
    </div>
  );
}

function RadarChart() {
  return (
    <svg className="cap-radar" viewBox="0 0 260 230" role="img" aria-label="能力维度雷达图">
      <g fill="none" stroke="#dce6f3"><polygon points="130,18 224,86 188,196 72,196 36,86"/><polygon points="130,48 194,95 170,170 90,170 66,95"/><polygon points="130,78 164,103 151,144 109,144 96,103"/><line x1="130" y1="18" x2="130" y2="196"/><line x1="224" y1="86" x2="72" y2="196"/><line x1="188" y1="196" x2="36" y2="86"/></g>
      <polygon points="130,42 205,92 174,177 82,180 57,91" fill="rgba(0,102,204,.14)" stroke="#0066cc" strokeWidth="2" />
      {[[130,42],[205,92],[174,177],[82,180],[57,91]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill="#0066cc" />)}
      <g fill="#536176" fontSize="11"><text x="108" y="12">代码质量</text><text x="225" y="88">工程能力</text><text x="170" y="218">问题解决</text><text x="38" y="218">技术深度</text><text x="2" y="88">项目复杂度</text></g>
    </svg>
  );
}

function ReportPanel() {
  return (
    <div className="product-window report-window">
      <div className="overall-score"><span>综合评分</span><strong>86<small>/100</small></strong><em>良好</em><div className="star-row">★★★★★</div><hr/><b>评估维度得分</b>{[["代码质量",88],["工程能力",86],["技术深度",86],["项目复杂度",85]].map(([name,value]) => <p key={name}>{name}<span>{value}/100</span></p>)}</div>
      <div className="radar-panel"><RadarChart /><div><i /> 得分　 <span>平均水平</span></div></div>
      <div className="report-summary"><strong>AI 总结</strong><p>该项目整体设计合理，代码结构清晰，使用了完整学习和工程化实践，具备较强的工程能力。</p><div className="summary-columns"><div><b>优点亮点</b><span>• 清晰的分层架构</span><span>• 良好的代码规范</span><span>• 完整的单元测试</span></div><div><b>不足分析</b><span>• 部分模块耦合较高</span><span>• 缺少自动化部署</span><span>• 性能优化空间较大</span></div></div><button type="button">生成一份 <ArrowRight /></button></div>
    </div>
  );
}

function SharePanel() {
  return (
    <div className="product-window share-window">
      <div className="share-settings"><strong>生成分享链接</strong><label>授权人邮箱<input value="interviewer@company.com" readOnly /></label><small>可输入多个邮箱，逗号分隔</small><label>可查看内容</label><div className="check-grid">{["项目概况","审查报告","面试记录","能力报告"].map(item => <span key={item}><Check />{item}</span>)}</div><label>有效期</label><div className="radio-row"><span>○ 7天</span><span>● 14天</span><span>○ 30天</span><span>○ 自定义</span></div><div className="toggle-row">访问密码 <i><b /></i><small>设置密码（选填）</small></div><button type="button"><Link2 /> 生成链接并分享</button></div>
      <div className="share-preview"><strong>链接预览</strong><div><input value="https://hirescope.ai/share/4xC6EfOh" readOnly/><button type="button">复制链接</button></div><dl><div><dt>链接有效期</dt><dd>2026-05-18 14:32 至 2026-06-01 14:32</dd></div><div><dt>访问权限</dt><dd>仅限指定邮箱访问，需要邮箱验证</dd></div></dl><button className="danger-button" type="button">撤销分享</button></div>
    </div>
  );
}

function CandidatePanel() {
  return (
    <article className="mini-product-card candidate-card">
      <header><span className="candidate-avatar" role="img" aria-label="候选人张伟头像"><svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="avatar-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dceeff"/><stop offset="1" stopColor="#9fc5ec"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#avatar-bg)"/><circle cx="32" cy="24" r="11" fill="#f3c9ad"/><path d="M20 24c1-10 5-15 13-15 8 0 13 6 12 16-4-2-7-6-8-10-4 5-9 7-17 9Z" fill="#23364a"/><path d="M13 64c1-16 8-24 19-24s19 8 20 24" fill="#263e58"/><path d="M26 39c1 5 11 5 12 0l4 3c-2 8-17 8-20 0Z" fill="#fff" opacity=".88"/></svg></span><div><strong>张伟</strong><small>高级后端工程师<br/>某科技有限公司</small></div></header>
      <div className="candidate-grid"><div><small>综合评分</small><strong>86<em>/100</em></strong><div className="star-row">★★★★★</div><span className="tag">良好</span><div className="tag-list"><i>Python</i><i>Django</i><i>机器学习</i></div></div><div><b>评估摘要</b><p>• 项目经验清晰，工程规范良好</p><p>• 技术选型合理，解决方案可行</p><p>• 具备较强的问题解决能力</p><b>推荐面试重点</b><ol><li>深入了解模型训练优化策略</li><li>探讨大规模性能优化方案</li><li>评估代码设计与可扩展性</li></ol><a>查看完整报告 →</a></div></div>
    </article>
  );
}

function AdminPanel() {
  return (
    <article className="mini-product-card admin-card">
      <nav>{["用户管理","项目管理","模板配置","数据统计"].map((item,index) => <span className={index === 3 ? "active" : ""} key={item}>{item}</span>)}</nav>
      <div className="stat-grid">{[["用户总数","1,248","+12%"],["项目总数","3,562","+10%"],["面试总数","2,891","+15%"],["通过率","78%","+6%"]].map(([name,value,change], index) => <div key={name}><i>{String(index + 1).padStart(2,"0")}</i><small>{name}</small><strong>{value}</strong><em>{change}</em></div>)}</div>
      <div className="dashboard-grid"><div className="trend-card"><header><strong>使用趋势</strong><small>近 30 天</small></header><svg viewBox="0 0 420 138" role="img" aria-label="近 30 天使用趋势折线图"><defs><linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2378f5" stopOpacity=".18"/><stop offset="1" stopColor="#2378f5" stopOpacity="0"/></linearGradient></defs><g className="chart-grid"><line x1="0" y1="25" x2="420" y2="25"/><line x1="0" y1="65" x2="420" y2="65"/><line x1="0" y1="105" x2="420" y2="105"/></g><path d="M0 108 L35 82 L70 96 L105 59 L140 84 L175 43 L210 72 L245 49 L280 82 L315 66 L350 35 L385 59 L420 55 L420 126 L0 126Z" fill="url(#trend-area)"/><polyline points="0,108 35,82 70,96 105,59 140,84 175,43 210,72 245,49 280,82 315,66 350,35 385,59 420,55" fill="none" stroke="#2378f5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><g className="chart-points">{[[35,82],[105,59],[175,43],[245,49],[350,35],[420,55]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5"/>)}</g><g className="chart-labels"><text x="0" y="137">5/01</text><text x="185" y="137">5/15</text><text x="388" y="137">5/30</text></g></svg></div><div className="stack-card"><header><strong>热门技术栈 TOP 5</strong><small>项目占比</small></header>{[["Python",45],["JavaScript",30],["Java",20],["Go",12],["C++",6]].map(([name,value]) => <p key={name}><span>{name}</span><i><b style={{width:`${value}%`}} /></i><small>{value}%</small></p>)}</div></div>
    </article>
  );
}

export default function CapabilitiesPage() {
  return (
    <><SiteHeader current="capabilities" /><main className="capabilities-page"><CapabilitiesRevealManager />
      <section className="cap-hero cap-reveal-section is-visible">
        <div className="cap-container cap-hero-grid"><div className="cap-hero-copy"><span data-cap-reveal-item>产品能力</span><h1 data-cap-reveal-item data-cap-reveal-delay="1" aria-label={HERO_TITLE}>从项目审查到<span className="cap-title-nowrap">能力报告</span>，<br/>形成完整评估闭环</h1><p data-cap-reveal-item data-cap-reveal-delay="2">码途 AI 连接项目解析、代码审查、模拟面试、能力报告与分享授权，让每个技术项目都能被准确理解、公正评估、清晰呈现。</p><div className="hero-benefits" data-cap-reveal-item data-cap-reveal-delay="3">{heroBenefits.map(({icon:IconComponent,title,text}) => <div key={title}><IconComponent/><span><strong>{title}</strong><small>{text}</small></span></div>)}</div></div><div className="process-card" data-cap-reveal-item data-cap-reveal-delay="4">{processSteps.map(({icon:IconComponent,title},index) => <div className="process-step" key={title}><i><IconComponent /></i><small>{String(index + 1).padStart(2,"0")}</small><strong>{title}</strong></div>)}<div className="process-track"><i/><i/><i/><i/><i/><i/></div><div className="process-loop"><span>完整评估闭环</span></div></div></div>
      </section>

      <section className="cap-section cap-reveal-section"><div className="cap-container cap-two-column"><SectionCopy number="01" label="项目上传与解析" title="从一个项目开始，理解你的技术能力" description="支持多种来源导入，AI 自动解析并提取关键信息，快速建模项目画像。" features={sections.upload}/><div className="cap-mockup" data-cap-reveal-item data-cap-reveal-delay="4"><ProjectOverview /></div></div></section>
      <section className="cap-section cap-section-tint cap-reveal-section"><div className="cap-container cap-two-column"><SectionCopy number="02" label="AI 项目审查" title="不只看项目能不能跑，更看工程质量" description="AI 深度审查代码质量与工程规范，识别潜在风险，给出改进建议。" features={sections.review}/><div className="cap-mockup" data-cap-reveal-item data-cap-reveal-delay="4"><ReviewPanel /></div></div></section>
      <section className="cap-section cap-reveal-section"><div className="cap-container cap-two-column"><SectionCopy number="03" label="AI 模拟面试" title="让每个项目，都能变成一次真实面试" description="基于项目内容生成针对性问题，模拟真实面试场景，全面评估技术深度。" features={sections.interview}/><div className="cap-mockup" data-cap-reveal-item data-cap-reveal-delay="4"><InterviewPanel /></div></div></section>
      <section className="cap-section cap-section-tint cap-reveal-section"><div className="cap-container cap-two-column"><SectionCopy number="04" label="能力报告生成" title="把项目表现，转化为清晰的能力报告" description="多维度量化评估，AI 总结关键亮点与改进空间，生成专业报告。" features={sections.report}/><div className="cap-mockup" data-cap-reveal-item data-cap-reveal-delay="4"><ReportPanel /></div></div></section>
      <section className="cap-section cap-reveal-section"><div className="cap-container cap-two-column"><SectionCopy number="05" label="分享授权" title="分享给面试官，但权限始终由你控制" description="安全、可控地分享报告给指定面试官，支持权限与有效期管理。" features={[[Send,"投递授权",""],[LockKeyhole,"权限控制",""],[CalendarClock,"有效期",""],[RotateCcw,"可撤销",""]]}/><div className="cap-mockup" data-cap-reveal-item data-cap-reveal-delay="4"><SharePanel /></div></div></section>

      <section className="cap-dual-section cap-reveal-section"><div className="cap-container dual-grid"><div data-cap-reveal-item><SectionCopy number="06" label="面试官辅助评估" title="为面试官提供高效评估辅助" description="快速把握候选人项目与特点，AI 提供评估建议与面试问题参考。" features={[]}/><CandidatePanel /></div><div data-cap-reveal-item data-cap-reveal-delay="4"><SectionCopy number="07" label="管理员配置" title="灵活配置与数据洞察" description="管理员可配置评估模板、管理用户与项目、洞察使用数据。" features={[]}/><AdminPanel /></div></div></section>

      <section className="cap-bottom cap-reveal-section"><div className="cap-container"><div className="cap-cta" data-cap-reveal-item><Logo compact/><div><h2>从项目到面试，从能力到报告</h2><p>码途 AI 让技术能力被准确理解，让优秀人才脱颖而出。</p></div><div><Link href="/login">立即体验</Link><Link className="secondary-cta" href="/process">查看使用流程 <ArrowRight /></Link></div></div><footer className="cap-footer" data-cap-reveal-item data-cap-reveal-delay="2"><div><Logo /><p>让项目能力被看见，让优秀人才脱颖而出。</p><small>© 2026 码途 AI. All rights reserved.</small></div><dl><div><dt>产品</dt><dd>产品能力</dd><dd>使用流程</dd><dd>报告示例</dd></div><div><dt>资源</dt><dd>帮助中心</dd><dd>常见问题</dd><dd>更新日志</dd></div><div><dt>关于我们</dt><dd>关于我们</dd><dd>加入我们</dd><dd>联系我们</dd></div><div><dt>关注我们</dt><dd>微信　GitHub　LinkedIn</dd></div></dl></footer></div></section>
    </main></>
  );
}
