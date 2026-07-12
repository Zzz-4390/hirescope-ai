"use client";

import { AlertCircle, CheckCircle2, CircleX, Code2, File, Folder, Info, Loader2, LockKeyhole, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import {
  type AsyncTask,
  type Project,
  type ProjectAnalysis,
  getProject,
  getProjectAnalysis,
  getTask,
  isTerminalTaskStatus,
} from "../lib/projects";
import styles from "./ProjectDetailClient.module.css";

interface ProjectDetailClientProps {
  projectId: string;
}

const ANALYSIS_PROCESSING_STATUSES = new Set<Project["status"]>(["UPLOADED", "QUEUED", "ANALYZING"]);

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [task, setTask] = useState<AsyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const taskStorageKey = useMemo(() => `hirescope.projectTask.${projectId}`, [projectId]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearPolling = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = (callback: () => Promise<void>) => {
      clearPolling();
      timer = setTimeout(() => void callback(), 2500);
    };

    const loadAnalysis = async () => {
      try {
        const currentAnalysis = await getProjectAnalysis(projectId);
        if (mounted) setAnalysis(currentAnalysis);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.code === "PROJECT_ANALYSIS_NOT_READY" || cause.status === 409)) return;
        if (mounted) setError(cause instanceof Error ? cause.message : "分析结果加载失败");
      }
    };

    const finishPolling = (status: Project["status"]) => {
      clearPolling();
      if (status === "COMPLETED" || status === "FAILED") sessionStorage.removeItem(taskStorageKey);
    };

    const refreshProject = async (): Promise<void> => {
      try {
        const currentProject = await getProject(projectId);
        if (!mounted) return;
        setProject(currentProject);

        if (currentProject.status === "COMPLETED") {
          finishPolling(currentProject.status);
          await loadAnalysis();
          return;
        }
        if (currentProject.status === "FAILED") {
          finishPolling(currentProject.status);
          return;
        }
        if (!isAnalysisProcessingStatus(currentProject.status)) {
          clearPolling();
          return;
        }

        const taskId = sessionStorage.getItem(taskStorageKey);
        if (taskId) await refreshTask(taskId);
        else schedule(refreshProject);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "项目状态刷新失败");
        clearPolling();
      }
    };

    const refreshTask = async (taskId: string): Promise<void> => {
      try {
        const currentTask = await getTask(taskId);
        if (!mounted) return;
        setTask(currentTask);

        if (isTerminalTaskStatus(currentTask.status)) {
          sessionStorage.removeItem(taskStorageKey);
          schedule(refreshProject);
          return;
        }
        schedule(refreshProject);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "任务状态加载失败");
        clearPolling();
      }
    };

    const loadInitial = async () => {
      setIsLoading(true);
      await refreshProject();
      if (mounted) setIsLoading(false);
    };

    void loadInitial();
    return () => {
      mounted = false;
      clearPolling();
    };
  }, [projectId, taskStorageKey]);

  if (isLoading) {
    return <div className="state-panel"><Loader2 aria-hidden="true" /><span>正在加载项目详情...</span></div>;
  }

  if (!project) {
    return <section className={styles.page}>
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      <div className="empty-panel"><AlertCircle aria-hidden="true" /><h2>项目不存在</h2><p>请返回项目列表确认该项目是否仍然存在。</p></div>
    </section>;
  }

  const hasAnalysis = Boolean(analysis);
  const noSourceCode = Boolean(analysis) && getAnalysisMetrics(analysis).codeFiles === 0;

  return (
    <section className={styles.page}>
      {error ? <p className="app-banner error" role="alert">{error}</p> : null}
      <div className={styles.pageHeading}>
        <div>
          <span className={styles.eyebrow}>项目详情</span>
          <h1>{project.name}</h1>
          <p>{project.description || "暂无项目描述"}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <AnalysisView analysis={analysis} project={project} task={task} noSourceCode={noSourceCode} />

      <section className={styles.section} aria-labelledby="next-steps-title">
        <div className={styles.sectionHeading}>
          <div><span>04</span><h2 id="next-steps-title">下一步建议</h2></div>
          <p>{project.status === "COMPLETED" ? "分析完成后，可继续进入后续流程。" : "请等待项目分析完成后再继续。"}</p>
        </div>
        <div className={styles.nextContent}>
          <div>
            <p className={styles.actionDescription}>代码审查可帮助梳理项目风险，模拟面试将围绕识别出的项目内容生成问题。</p>
            {noSourceCode ? <p className={styles.sourceWarning}><Info aria-hidden="true" />当前项目未识别到有效源码，代码审查和模拟面试结果可能不完整。</p> : null}
          </div>
          <div className={styles.pageActions}>
            <ProjectAction enabled={project.status === "COMPLETED" && hasAnalysis} href={`/app/projects/${project.id}/review`} icon={<Code2 aria-hidden="true" />} label="代码审查" primary />
            <ProjectAction enabled={project.status === "COMPLETED" && hasAnalysis} href={`/app/projects/${project.id}/interviews`} icon={<MessageSquareText aria-hidden="true" />} label="模拟面试" />
          </div>
        </div>
      </section>
    </section>
  );
}

function AnalysisView({ analysis, project, task, noSourceCode }: { analysis: ProjectAnalysis | null; project: Project; task: AsyncTask | null; noSourceCode: boolean }) {
  const metrics = getAnalysisMetrics(analysis);
  const status = getStatusPresentation(project.status);

  return <div className={styles.contentStack}>
    <section className={styles.section} aria-labelledby="overview-title">
      <div className={styles.sectionHeading}>
        <div><span>01</span><h2 id="overview-title">分析概览</h2></div>
        <p>{status.message}</p>
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.summaryBlock}>
          <StatusLine status={status} task={task} />
          <p>{buildSummary(metrics, project.status)}</p>
          {project.status === "FAILED" ? <p className={styles.failureText}>{project.failure?.message || task?.failure?.message || "项目分析未能完成，请检查压缩包后重新上传。"}</p> : null}
        </div>
        <dl className={styles.metrics}>
          <Metric label="文件数" value={formatMetric(metrics.totalFiles, "暂无可用的文件统计信息")} />
          <Metric label="代码文件数" value={formatMetric(metrics.codeFiles, "暂无可用的代码统计信息")} />
          <Metric label="代码行数" value={formatMetric(metrics.totalLines, "暂无可用的代码统计信息")} />
          <Metric label="主要语言" value={metrics.primaryLanguage || "暂未识别主要编程语言"} />
        </dl>
      </div>
      {noSourceCode ? <NoSourceNotice /> : null}
    </section>

    <section className={styles.section} aria-labelledby="structure-title">
      <div className={styles.sectionHeading}><div><span>02</span><h2 id="structure-title">项目结构</h2></div><p>按目录层级展示已获取的项目文件。</p></div>
      {metrics.directoryTree.length > 0 ? <div className={styles.fileTree}>{metrics.directoryTree.map((item) => <div className={styles.treeRow} style={{ "--tree-depth": item.depth } as React.CSSProperties} key={`${item.type}-${item.path}`}><span>{item.type === "directory" ? <Folder aria-hidden="true" /> : <File aria-hidden="true" />}</span><span>{item.name}</span></div>)}</div> : <EmptyValue text="未获取到项目目录结构" />}
    </section>

    <section className={styles.section} aria-labelledby="technology-title">
      <div className={styles.sectionHeading}><div><span>03</span><h2 id="technology-title">技术识别</h2></div><p>展示当前分析规则能够识别到的技术信息。</p></div>
      <div className={styles.techGrid}>
        <RecognitionList title="编程语言" values={metrics.languages} emptyText="暂未识别主要编程语言" />
        <RecognitionList title="框架" values={metrics.frameworks} emptyText="未识别到框架" />
        <RecognitionList title="依赖或工具" values={metrics.tools} emptyText="未识别到依赖或工具" />
        <RecognitionList title="入口文件" values={metrics.entryFiles} emptyText="未发现入口文件" mono />
        <RecognitionList title="配置文件" values={metrics.configFiles} emptyText="未识别到常见配置文件" mono />
        <RecognitionList title="核心模块" values={metrics.modules} emptyText="未识别到核心模块" mono />
      </div>
    </section>
  </div>;
}

function StatusBadge({ status }: { status: Project["status"] }) {
  const presentation = getStatusPresentation(status);
  const Icon = presentation.icon;
  return <span className={`${styles.statusBadge} ${styles[presentation.tone]}`}><Icon aria-hidden="true" />{presentation.label}</span>;
}

function StatusLine({ status, task }: { status: StatusPresentation; task: AsyncTask | null }) {
  const Icon = status.icon;
  return <div className={`${styles.statusLine} ${styles[status.tone]}`}><Icon aria-hidden="true" /><strong>{status.label}</strong>{task && isAnalysisProcessingStatusValue(status) ? <span>{taskStatusText(task.status)}</span> : null}</div>;
}

function ProjectAction({ enabled, href, icon, label, primary = false }: { enabled: boolean; href: string; icon: ReactNode; label: string; primary?: boolean }) {
  const className = `${styles.actionButton} ${primary ? styles.primaryAction : styles.secondaryAction}`;
  if (enabled) return <Link className={className} href={href}>{icon}{label}</Link>;
  return <span className={`${className} ${styles.disabledAction}`} role="link" aria-disabled="true"><LockKeyhole aria-hidden="true" />{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function EmptyValue({ text }: { text: string }) {
  return <p className={styles.emptyValue}>{text}</p>;
}

function RecognitionList({ title, values, emptyText, mono = false }: { title: string; values: string[]; emptyText: string; mono?: boolean }) {
  return <article className={styles.recognitionCard}><h3>{title}</h3>{values.length > 0 ? <ul className={mono ? styles.pathList : styles.tagList}>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <EmptyValue text={emptyText} />}</article>;
}

function NoSourceNotice() {
  return <p className={styles.noSourceNotice}><AlertCircle aria-hidden="true" /><span>当前压缩包中未检测到有效源代码。请重新上传包含源码、依赖配置和项目配置文件的完整项目，例如 <code>package.json</code>、<code>requirements.txt</code>、<code>pom.xml</code>、<code>build.gradle</code>、<code>go.mod</code>、<code>Cargo.toml</code> 或实际源代码目录。</span></p>;
}

interface StatusPresentation {
  label: string;
  message: string;
  tone: "success" | "processing" | "failed" | "neutral";
  icon: typeof CheckCircle2;
}

function getStatusPresentation(status: Project["status"]): StatusPresentation {
  if (status === "COMPLETED") return { label: "已完成", message: "项目分析已完成，可继续代码审查或模拟面试。", tone: "success", icon: CheckCircle2 };
  if (status === "FAILED") return { label: "分析失败", message: "项目分析失败，当前结果不可用。", tone: "failed", icon: CircleX };
  if (status === "UPLOADED") return { label: "等待进入队列", message: "项目已上传，正在等待分析任务开始。", tone: "processing", icon: Loader2 };
  if (status === "QUEUED") return { label: "排队中", message: "项目正在排队，系统会在开始分析后自动刷新。", tone: "processing", icon: Loader2 };
  if (status === "ANALYZING") return { label: "分析中", message: "正在识别项目结构和技术信息。", tone: "processing", icon: Loader2 };
  if (status === "DELETING") return { label: "正在删除", message: "项目正在删除，已停止分析状态轮询。", tone: "neutral", icon: AlertCircle };
  if (status === "DELETED") return { label: "项目已删除", message: "该项目已删除，无法继续分析。", tone: "neutral", icon: AlertCircle };
  return { label: "状态未知", message: "项目状态暂不支持自动刷新，已停止轮询。", tone: "neutral", icon: AlertCircle };
}

function isAnalysisProcessingStatus(status: Project["status"]): boolean {
  return ANALYSIS_PROCESSING_STATUSES.has(status);
}

function isAnalysisProcessingStatusValue(status: StatusPresentation): boolean {
  return status.tone === "processing";
}

interface AnalysisMetrics {
  totalFiles: number | null;
  codeFiles: number | null;
  totalLines: number | null;
  primaryLanguage: string | null;
  languages: string[];
  frameworks: string[];
  tools: string[];
  entryFiles: string[];
  configFiles: string[];
  modules: string[];
  directoryTree: Array<{ path: string; name: string; depth: number; type: "file" | "directory" }>;
}

function getAnalysisMetrics(analysis: ProjectAnalysis | null): AnalysisMetrics {
  const statistics = isRecord(analysis?.statistics) ? analysis.statistics : {};
  const languageEntries = isRecord(statistics.languages) ? Object.entries(statistics.languages).flatMap(([name, count]) => typeof count === "number" && Number.isFinite(count) && count > 0 ? [{ name, count }] : []) : [];
  const techStack = Array.isArray(analysis?.techStack) ? analysis.techStack : [];
  const tech = techStack.flatMap((item) => isRecord(item) && typeof item.name === "string" && item.name.trim() ? [{ name: item.name.trim(), category: typeof item.category === "string" ? item.category.toLowerCase() : "" }] : []);
  const codeFiles = finiteNumber(statistics.codeFiles) ?? (languageEntries.length > 0 ? languageEntries.reduce((sum, item) => sum + item.count, 0) : 0);
  const configFiles = getStringList(analysis?.directoryTree).filter((path) => isConfigFile(path));

  return {
    totalFiles: finiteNumber(statistics.totalFiles),
    codeFiles,
    totalLines: finiteNumber(statistics.totalLines),
    primaryLanguage: languageEntries.sort((a, b) => b.count - a.count)[0]?.name ?? null,
    languages: uniqueStrings([...languageEntries.map((item) => item.name), ...tech.filter((item) => item.category === "language").map((item) => item.name)]),
    frameworks: uniqueStrings(tech.filter((item) => item.category.includes("framework")).map((item) => item.name)),
    tools: uniqueStrings(tech.filter((item) => item.category && item.category !== "language" && !item.category.includes("framework")).map((item) => item.name)),
    entryFiles: getStringList(analysis?.entryFiles),
    configFiles: uniqueStrings(configFiles),
    modules: getModuleList(analysis?.coreModules),
    directoryTree: getDirectoryTree(analysis?.directoryTree),
  };
}

function buildSummary(metrics: AnalysisMetrics, status: Project["status"]): string {
  if (status === "COMPLETED") {
    if (metrics.codeFiles === 0) return "分析已完成，但当前压缩包中未识别到可用于代码分析的源文件。";
    const details = [metrics.totalFiles === null ? null : `${metrics.totalFiles} 个文件`, metrics.codeFiles === null ? null : `${metrics.codeFiles} 个代码文件`, metrics.primaryLanguage ? `主要使用 ${metrics.primaryLanguage}` : null].filter(Boolean);
    return details.length > 0 ? `已完成项目扫描，识别到${details.join("、")}。` : "项目分析已完成，可继续代码审查或模拟面试。";
  }
  if (status === "FAILED") return "本次项目分析未生成可用结果。";
  return "分析完成后将在此展示项目文件、代码规模和主要技术信息。";
}

function getDirectoryTree(value: unknown): AnalysisMetrics["directoryTree"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.path !== "string" || !item.path.trim()) return [];
    const path = item.path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!path) return [];
    const type: "file" | "directory" | null = item.type === "directory" ? "directory" : item.type === "file" ? "file" : null;
    if (!type) return [];
    const segments = path.split("/");
    return [{ path, name: segments.at(-1) || path, depth: segments.length - 1, type }];
  }).sort((a, b) => a.path.localeCompare(b.path) || (a.type === "directory" ? -1 : 1));
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : isRecord(item) && typeof item.path === "string" && item.path.trim() ? [item.path.trim()] : []));
}

function getModuleList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((item) => isRecord(item) && typeof item.name === "string" && item.name.trim() ? [typeof item.path === "string" && item.path.trim() ? `${item.name.trim()}（${item.path.trim()}）` : item.name.trim()] : []));
}

function isConfigFile(path: string): boolean {
  return /(^|\/)(package\.json|requirements\.txt|pom\.xml|build\.gradle|go\.mod|cargo\.toml|tsconfig\.json|vite\.config\.[^/]+|next\.config\.[^/]+)$/i.test(path);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetric(value: number | null, emptyText: string): string {
  return value === null ? emptyText : value.toLocaleString("zh-CN");
}

function taskStatusText(status: AsyncTask["status"]): string {
  const map: Record<AsyncTask["status"], string> = { PENDING: "等待处理", QUEUED: "排队中", PROCESSING: "处理中", SUCCEEDED: "分析完成", FAILED: "分析失败", CANCELLED: "已取消" };
  return map[status];
}
