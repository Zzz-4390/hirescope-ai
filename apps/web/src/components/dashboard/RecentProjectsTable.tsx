import { ArrowRight, Folder } from "lucide-react";
import Link from "next/link";

import type { Project } from "../../lib/projects";
import { formatDate } from "./dashboard-model";
import styles from "./Dashboard.module.css";

export function RecentProjectsTable({ projects }: { projects: Project[] }) {
  return <section className={styles.projectsPanel} id="projects"><h2>近期项目</h2><div className={styles.projectTable}><div className={styles.tableHead}><span>项目名称</span><span>分析状态</span><span>更新时间</span><span>操作</span></div>{projects.slice(0, 5).map((project) => <div className={styles.tableRow} key={project.id}><span><Folder aria-hidden="true" /><strong>{project.name}</strong><small>{project.originalFileName}</small></span><span className={`${styles.projectStatus} ${styles[project.status.toLowerCase()]}`}>{statusText(project.status)}</span><time>{formatDate(project.updatedAt)}</time><Link href={`/app/projects/${project.id}`}>查看详情<ArrowRight aria-hidden="true" /></Link></div>)}</div>{projects.length === 0 ? <p className={styles.inlineEmpty}>还没有项目，上传 ZIP 后会显示在这里。</p> : null}</section>;
}

function statusText(status: Project["status"]): string { return { UPLOADED: "已上传", QUEUED: "排队中", ANALYZING: "分析中", COMPLETED: "已完成", FAILED: "失败", DELETING: "删除中", DELETED: "已删除" }[status]; }
