import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileSearch,
  Lightbulb,
  LockKeyhole,
  MessageSquareText,
  ScanSearch,
  Upload,
} from "lucide-react";
import Link from "next/link";

import styles from "./Dashboard.module.css";

const emptyPhases = [
  { label: "上传项目", description: "上传 ZIP 代码项目", icon: Upload },
  { label: "项目分析", description: "识别技术栈与核心模块", icon: ScanSearch },
  { label: "AI 代码审查", description: "检查质量、规范与风险", icon: FileSearch },
  { label: "模拟面试", description: "围绕真实项目生成问题", icon: MessageSquareText },
  { label: "能力报告", description: "生成能力总结与建议", icon: ClipboardCheck },
] as const;

const capabilityDimensions = ["代码质量", "工程能力", "架构理解", "问题解决", "沟通表达"] as const;

const generatedResults = [
  { title: "项目分析结果", description: "技术栈、目录结构与核心模块会从真实项目中提取。" },
  { title: "代码审查建议", description: "聚焦代码质量、工程规范、安全风险与可维护性。" },
  { title: "能力改进方向", description: "结合模拟面试表现，生成可执行的后续提升建议。" },
] as const;

export function EmptyDashboard({ greeting, userName }: { greeting: string; userName: string }) {
  return (
    <div className={styles.emptyContent}>
      <section className={styles.emptyWelcome} aria-labelledby="empty-dashboard-title">
        <div>
          <h1 id="empty-dashboard-title">{greeting}，{userName} <span aria-hidden="true">👋</span></h1>
          <p>你还没有项目。上传代码项目后，系统将依次完成项目分析、AI 代码审查、模拟面试并生成能力报告。</p>
        </div>
        <Link className={styles.emptyPrimaryAction} href="/app/projects/new">
          <Upload aria-hidden="true" />上传第一个项目
        </Link>
      </section>

      <div className={styles.emptyTrackLayout}>
        <section className={styles.emptyTrackSection} aria-labelledby="empty-track-title">
          <div className={styles.emptySectionHeading}>
            <div>
              <h2 id="empty-track-title">项目成长轨道</h2>
              <p>从上传真实代码开始，逐步完成分析、审查、面试和报告。</p>
            </div>
          </div>
          <ol className={styles.emptyTrack} aria-label="项目成长轨道，等待上传">
            {emptyPhases.map((phase, index) => {
              const Icon = phase.icon;
              const isReady = index === 0;
              return (
                <li className={isReady ? styles.readyPhase : styles.lockedPhase} key={phase.label}>
                  <span className={styles.emptyTrackNode}><Icon aria-hidden="true" /></span>
                  <div>
                    <strong>{phase.label}</strong>
                    <p>{phase.description}</p>
                    <small>{isReady ? "可开始" : "未解锁"}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className={styles.emptyAdvice} aria-labelledby="next-step-title">
          <div><Lightbulb aria-hidden="true" /><h2 id="next-step-title">下一步建议</h2></div>
          <p>准备一个 ZIP 代码项目，上传后系统会自动开始项目分析。</p>
          <Link href="/app/projects/new">查看上传要求 <ArrowRight aria-hidden="true" /></Link>
        </aside>
      </div>

      <section className={styles.capabilityPreview} aria-labelledby="capability-preview-title">
        <header>
          <h2 id="capability-preview-title">能力报告预览</h2>
          <p>完成项目分析、代码审查和模拟面试后，将生成真实能力评估结果。</p>
        </header>
        <div className={styles.capabilityPreviewBody}>
          <div className={styles.lockedRadar}>
            <svg viewBox="0 0 240 210" role="img" aria-label="能力报告待生成">
              <polygon points="120,24 205,86 172,186 68,186 35,86" fill="none" stroke="#d8e3f1" />
              <polygon points="120,53 177,94 155,160 85,160 63,94" fill="none" stroke="#e5ebf4" />
              <path d="M120 24v136M205 86 85 160M172 186 63 94M68 186l109-92M35 86l120 74" fill="none" stroke="#e8eef6" />
            </svg>
            <span><LockKeyhole aria-hidden="true" /></span>
            <strong>报告待生成</strong>
          </div>

          <div className={styles.capabilityStructure}>
            <span>综合评分</span>
            <strong>-- <small>/ 100</small></strong>
            <div>
              {capabilityDimensions.map((dimension) => <p key={dimension}><span>{dimension}</span><b>--</b></p>)}
            </div>
          </div>

          <aside className={styles.reportRequirements}>
            <h3>报告生成条件</h3>
            <p>以下流程完成后，工作台会展示真实评分与能力维度。</p>
            <ul>
              <li><Check aria-hidden="true" />完成项目分析</li>
              <li><Check aria-hidden="true" />生成 AI 代码审查</li>
              <li><Check aria-hidden="true" />完成模拟面试</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className={styles.generatedResults} aria-labelledby="generated-results-title">
        <div className={styles.generatedResultsMain}>
          <div>
            <h2 id="generated-results-title">上传后可以获得什么</h2>
            <p>所有结果均基于你上传的真实项目与后续面试表现生成。</p>
            <Link href="/reports">查看示例报告 <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.generatedResultList}>
            {generatedResults.map((result, index) => (
              <article key={result.title}><span>0{index + 1}</span><div><h3>{result.title}</h3><p>{result.description}</p></div></article>
            ))}
          </div>
        </div>
        <div className={styles.reportExampleOutline}>
          <div>
            <span><ClipboardCheck aria-hidden="true" /></span>
            <div><h3>示例报告结构</h3><p>提前了解最终报告的内容组织，不展示任何虚构评分或用户结果。</p></div>
          </div>
          <ol>
            <li><span>01</span><strong>代码审查摘要</strong><small>问题、风险与改进方向</small></li>
            <li><span>02</span><strong>模拟面试复盘</strong><small>回答表现与知识点回顾</small></li>
            <li><span>03</span><strong>能力提升建议</strong><small>基于真实结果生成行动建议</small></li>
          </ol>
        </div>
      </section>
    </div>
  );
}
