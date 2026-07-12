import { Check, Database, FileCode2, Files, ScanLine } from "lucide-react";

import type { Project, ProjectAnalysis } from "../../lib/projects";
import { formatFileSize, getAnalysisMetrics } from "./dashboard-model";
import styles from "./Dashboard.module.css";

export function AnalysisOverview({ project, analysis, loading }: { project: Project; analysis: ProjectAnalysis | null; loading: boolean }) {
  const metrics = getAnalysisMetrics(analysis);
  const processing = ["UPLOADED", "QUEUED", "ANALYZING"].includes(project.status);
  return (
    <section className={styles.sectionPanel} id="analysis">
      <h2>项目分析概览</h2>
      <div className={styles.analysisGrid}>
        <div className={styles.analysisMain}>
          <header><div><h3>{project.name}</h3><div className={styles.tagRow}>{metrics.techStack.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div></div></header>
          <p className={styles.projectDescription}>{project.description || "该项目暂未填写描述。"}</p>
          <div className={styles.metricRow}>
            <Metric icon={<Database />} value={formatFileSize(project.fileSize)} label="项目大小" />
            <Metric icon={<Files />} value={metrics.totalFiles ?? "--"} label="文件数量" />
            <Metric icon={<FileCode2 />} value={metrics.codeFiles ?? "--"} label="代码文件" />
            <Metric icon={<ScanLine />} value={metrics.totalLines?.toLocaleString("zh-CN") ?? "--"} label="代码行数" />
          </div>
          <div className={styles.languageBlock}><strong>主要语言</strong>{metrics.languages.length > 0 ? <><div className={styles.languageLabels}>{metrics.languages.slice(0, 5).map((language) => <span key={language.name}>{language.name} <b>{language.percentage}%</b></span>)}</div><div className={styles.languageBar}>{metrics.languages.slice(0, 5).map((language) => <i key={language.name} style={{ width: `${language.percentage}%` }} />)}</div></> : <p className={styles.inlineEmpty}>分析完成后显示语言占比</p>}</div>
          <div className={styles.moduleBlock}><strong>核心模块</strong><div className={styles.moduleTags}>{metrics.modules.length > 0 ? metrics.modules.slice(0, 6).map((module) => <span key={module.path || module.name} title={module.description}>{module.name}</span>) : <span className={styles.emptyTag}>暂无模块数据</span>}</div></div>
        </div>
        <div className={styles.analysisSummary}>
          <h3>AI 分析摘要</h3>
          {loading ? <Skeleton lines={4} /> : analysis ? <><p>{analysis.summary}</p><h4>结构亮点</h4><ul>{metrics.modules.slice(0, 4).map((module) => <li key={module.path || module.name}><Check aria-hidden="true" />{module.description || `${module.name} 模块已被识别`}</li>)}</ul></> : <div className={styles.centerState}><ScanLine aria-hidden="true" /><strong>{project.status === "FAILED" ? "项目分析失败" : processing ? "正在分析项目" : "暂无分析结果"}</strong><p>{project.failure?.message || (processing ? "系统正在识别技术栈、目录与核心模块。" : "进入项目详情查看最新状态。")}</p></div>}
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) { return <div className={styles.metric}><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>; }
function Skeleton({ lines }: { lines: number }) { return <div className={styles.skeleton} aria-label="正在加载">{Array.from({ length: lines }, (_, index) => <i key={index} />)}</div>; }
