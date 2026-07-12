import { ArrowRight, BarChart3, CircleGauge, ListChecks, Trophy } from "lucide-react";
import Link from "next/link";

import type { Interview } from "../../lib/interviews";
import { difficultyText } from "./dashboard-model";
import { InterviewIllustration } from "./DashboardIllustrations";
import styles from "./Dashboard.module.css";

export function InterviewOverview({ projectId, interview, reportScore }: { projectId: string; interview: Interview | null; reportScore: number | null }) {
  const progress = interview ? Math.round((interview.currentIndex / Math.max(interview.questionCount, 1)) * 100) : 0;
  const action = getAction(projectId, interview);
  return (
    <section className={styles.interviewPanel} id="interview">
      <div className={styles.interviewCopy}><header><div><h2>模拟面试</h2><p>{interview ? `“${interview.title}”正在检验你的项目理解和技术表达。` : "通过真实项目问题检验项目理解和技术表达能力。"}</p></div></header>
        <div className={styles.interviewMetrics}>
          <Metric icon={<ListChecks />} value={interview?.questionCount ?? "--"} label="题目数量" />
          <Metric icon={<CircleGauge />} value={interview ? difficultyText(interview.difficulty) : "--"} label="难度级别" />
          <Metric icon={<BarChart3 />} value={`${progress}%`} label="完成进度" />
          <Metric icon={<Trophy />} value={reportScore ?? "--"} label="最高得分" />
        </div>
      </div>
      <div className={styles.interviewAction}><InterviewIllustration /><Link href={action.href}>{action.label}<ArrowRight aria-hidden="true" /></Link></div>
    </section>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) { return <div><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>; }
function getAction(projectId: string, interview: Interview | null): { href: string; label: string } {
  if (!interview) return { href: `/app/projects/${projectId}/interviews`, label: "生成面试题" };
  if (["GENERATING", "READY", "IN_PROGRESS"].includes(interview.status)) return { href: `/app/interviews/${interview.id}`, label: interview.status === "GENERATING" ? "查看生成进度" : "继续作答" };
  return { href: `/app/interviews/${interview.id}/report`, label: "查看报告" };
}
