import { AlertCircle, Check, LoaderCircle, Lightbulb } from "lucide-react";
import Link from "next/link";

import type { DashboardPhaseState } from "./dashboard-model";
import styles from "./Dashboard.module.css";

const labels = ["上传项目", "项目分析", "AI 代码审查", "模拟面试", "能力报告"];
const descriptions = ["ZIP 文件已上传", "分析项目结构", "评估代码质量", "检验项目能力", "生成能力画像"];

export function GrowthTrack({ states, projectId }: { states: DashboardPhaseState[]; projectId: string }) {
  const currentIndex = states.findIndex((state) => state === "processing" || state === "failed" || state === "pending");
  const advice = currentIndex < 0 ? "当前项目全部流程已完成，可查看能力报告。" : ["上传一个项目开始分析。", "项目正在分析，完成后即可发起代码审查。", "项目分析已就绪，建议生成 AI 代码审查。", "代码审查已完成，可以开始模拟面试。", "完成面试并生成你的能力报告。"][currentIndex];
  const href = currentIndex < 0 ? "#report" : currentIndex <= 1 ? `/app/projects/${projectId}` : currentIndex === 2 ? `/app/projects/${projectId}/review` : currentIndex === 3 ? `/app/projects/${projectId}/interviews` : "#report";

  return (
    <div className={styles.trackLayout}>
      <div className={styles.trackPanel} aria-label="项目成长轨道">
        {labels.map((label, index) => {
          const state = states[index];
          return (
            <div className={`${styles.trackStep} ${styles[state]}`} key={label}>
              <span className={styles.trackNode}>{state === "completed" ? <Check aria-hidden="true" /> : state === "processing" ? <LoaderCircle aria-hidden="true" /> : state === "failed" ? <AlertCircle aria-hidden="true" /> : null}</span>
              <strong>{label}</strong><small>{state === "failed" ? "处理失败" : descriptions[index]}</small>
            </div>
          );
        })}
      </div>
      <aside className={styles.advicePanel}>
        <div><Lightbulb aria-hidden="true" /><strong>下一步建议</strong></div>
        <p>{advice}</p>
        <Link href={href}>前往下一步 <span aria-hidden="true">→</span></Link>
      </aside>
    </div>
  );
}
