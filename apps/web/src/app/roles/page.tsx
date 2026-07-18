import { ArrowRight, Check, CircleUserRound, FileSearch, Settings, ShieldCheck, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "../../components/Logo";
import { RoleRevealManager } from "../../components/RoleRevealManager";

const roles=[
  [CircleUserRound,"求职者 / 学生","上传项目，完成 AI 审查与模拟面试，生成能力报告。","进入求职者空间"],
  [UserRoundCheck,"面试官 / 评审者","查看授权项目，快速理解候选人的项目能力与面试表现。","进入面试官空间"],
  [Settings,"管理员 / 平台方","管理用户、项目、报告与权限配置，保障平台稳定运行。","进入管理后台"],
] as const;
const rows=[["上传项目",1,0,0],["查看报告",1,1,1],["模拟面试",1,0,0],["分享授权",1,1,1],["项目评估",0,1,0],["系统管理",0,0,1]] as const;

export default function RolesPage(){return <main className="role-entry-page"><RoleRevealManager/>
  <section className="role-hero role-reveal-section is-visible"><div className="role-container role-hero-grid"><div data-role-reveal-item><span>角色入口</span><h1>选择你的角色，<br/>开启专属体验</h1><p>求职者、面试官与管理员在码途 AI 各自拥有独立的入口与专属工作空间。</p></div><div className="role-orbit" data-role-reveal-item><div className="orbit-center"><Logo compact/></div><article className="orbit-one"><CircleUserRound/><b>求职者</b><small>项目能力报告</small></article><article className="orbit-two"><FileSearch/><b>面试官</b><small>候选人评估</small></article><article className="orbit-three"><ShieldCheck/><b>管理员</b><small>平台管理</small></article></div></div></section>
  <section className="role-section role-reveal-section"><div className="role-container" data-role-reveal-item><h2>三类角色入口</h2><div className="role-card-grid">{roles.map(([Icon,title,text,cta])=><article key={title}><i><Icon/></i><h3>{title}</h3><p>{text}</p><Link href="/login">{cta} <ArrowRight/></Link></article>)}</div></div></section>
  <section className="role-section role-reveal-section"><div className="role-container" data-role-reveal-item><h2>角色能力对比</h2><div className="role-table"><header><span/><b>求职者</b><b>面试官</b><b>管理员</b></header>{rows.map(([label,...values])=><div key={label}><strong>{label}</strong>{values.map((value,index)=><span key={`${label}-${index}`} className={value?"yes":"no"}>{value?<Check/>:"—"}</span>)}</div>)}</div></div></section>
  <section className="role-bottom role-reveal-section"><div className="role-cta" data-role-reveal-item><h2>找到你的入口，开始使用码途 AI</h2><p>选择适合你的角色，进入专属工作空间，高效完成每一次项目评估与能力成长。</p><div><Link href="/login">立即体验 <ArrowRight/></Link><Link href="/process">查看使用流程 <ArrowRight/></Link></div></div><footer className="role-footer"><div><Logo/><p>让项目能力被看见，让优秀人才脱颖而出。</p></div><dl><div><dt>产品</dt><dd>产品能力</dd><dd>使用流程</dd><dd>报告示例</dd><dd>角色入口</dd></div><div><dt>资源</dt><dd>帮助中心</dd><dd>常见问题</dd><dd>更新日志</dd></div><div><dt>关于我们</dt><dd>关于码途 AI</dd><dd>联系我们</dd><dd>加入我们</dd></div></dl><small>© 2026 码途 AI · HireScope AI</small></footer></section>
</main>}
