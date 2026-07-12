import { LockKeyhole } from "lucide-react";

import type { InterviewReport } from "../../lib/interviews";
import type { ActivityItem } from "./dashboard-model";
import { formatDate } from "./dashboard-model";
import styles from "./Dashboard.module.css";

const dimensions: Array<{ key: keyof InterviewReport["dimensions"]; label: string }> = [{ key: "projectUnderstanding", label: "项目理解" }, { key: "technicalAccuracy", label: "技术准确" }, { key: "communication", label: "沟通表达" }, { key: "problemSolving", label: "问题解决" }];

export function CapabilityAndActivity({ report, activities }: { report: InterviewReport | null; activities: ActivityItem[] }) {
  return (
    <section className={styles.reportActivity} id="report">
      <div className={styles.capabilityPanel}><header><h2>能力报告</h2><p>{report ? "能力维度来自本次模拟面试报告。" : "完成模拟面试并生成报告后，可查看详细评估结果。"}</p></header><div className={styles.capabilityBody}><Radar report={report} /><div className={styles.capabilityScores}><span>综合评分</span><strong>{report?.overallScore ?? "--"}<small>/100</small></strong>{dimensions.map((dimension) => <p key={dimension.key}><span>{dimension.label}</span><b>{report?.dimensions[dimension.key] ?? "--"}</b></p>)}</div></div></div>
      <div className={styles.activityPanel}><h2>最近活动</h2><div className={styles.timeline}>{activities.map((item) => <article key={item.id} className={styles[item.tone]}><time>{formatDate(item.date)}</time><div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</div>{activities.length === 0 ? <p className={styles.inlineEmpty}>暂无活动</p> : null}</div>
    </section>
  );
}

function Radar({ report }: { report: InterviewReport | null }) {
  const values = report ? dimensions.map((item) => report.dimensions[item.key]) : [28, 28, 28, 28];
  const points = values.map((value, index) => { const angle = -Math.PI / 2 + index * Math.PI / 2; const radius = 72 * value / 100; return `${100 + Math.cos(angle) * radius},${92 + Math.sin(angle) * radius}`; }).join(" ");
  return <div className={styles.radarWrap}><svg viewBox="0 0 200 184" aria-label={report ? "能力雷达图" : "能力报告未生成"}><polygon points="100,20 172,92 100,164 28,92" fill="none" stroke="#d7e3f3"/><polygon points="100,44 148,92 100,140 52,92" fill="none" stroke="#e2eaf5"/><path d="M100 20v144M28 92h144" stroke="#e7edf6"/><polygon points={points} fill={report ? "rgba(0,102,204,.14)" : "rgba(160,174,192,.08)"} stroke={report ? "#0066cc" : "#c7d2e1"} strokeWidth="2"/></svg>{report ? null : <span><LockKeyhole aria-hidden="true" /></span>}</div>;
}
