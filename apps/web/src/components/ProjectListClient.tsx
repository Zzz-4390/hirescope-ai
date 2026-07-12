"use client";

import { ArrowRight, BarChart3, Code2, FileCheck2, FolderOpen, MessageSquareText, RefreshCw, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { type Project, listProjects } from "../lib/projects";
import { AppPage, DataSurface, EmptyHero, FeatureGrid, PageHeader, ProcessSteps } from "./AppPageUI";

const projectSteps = [
  { title: "上传项目", description: "ZIP 文件上传", icon: UploadCloud },
  { title: "项目分析", description: "技术栈与结构解析", icon: BarChart3 },
  { title: "AI 代码审查", description: "质量与风险评估", icon: Code2 },
  { title: "模拟面试", description: "生成专属面试题", icon: MessageSquareText },
  { title: "能力报告", description: "综合能力评估", icon: FileCheck2 },
];

const projectFeatures = [
  { title: "项目质量分析", description: "技术栈、目录与核心模块", icon: BarChart3 },
  { title: "代码能力评估", description: "质量、风险与改进建议", icon: Code2 },
  { title: "技术栈掌握度", description: "结合项目实践综合判断", icon: FolderOpen },
  { title: "模拟面试反馈", description: "专属问题与作答反馈", icon: MessageSquareText },
  { title: "个性化能力报告", description: "形成清晰成长方向", icon: FileCheck2 },
];

export function ProjectListClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await listProjects();
      setProjects(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listProjects()
      .then((response) => { if (active) setProjects(response.items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "项目列表加载失败"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <AppPage>
      <PageHeader
        title="我的项目"
        description="上传 ZIP 项目后，系统会自动完成技术栈、目录结构和核心模块分析，为后续审查和面试提供数据基础。"
        action={<Link className="primary-button compact" href="/app/projects/new"><UploadCloud aria-hidden="true" />上传项目</Link>}
      />

      {isLoading ? <div className="state-panel"><RefreshCw aria-hidden="true" /><span>正在加载项目列表...</span></div> : null}
      {!isLoading && error ? (
        <div className="empty-panel">
          <h2>项目列表加载失败</h2>
          <p>{error}</p>
          <button className="primary-button compact" type="button" onClick={() => void loadProjects()}>重试</button>
        </div>
      ) : null}
      {!isLoading && !error && projects.length === 0 ? (
        <>
          <EmptyHero
            kind="project"
            title="还没有项目"
            description="上传你的第一个项目，开启 AI 赋能的代码成长之旅。"
            action={<Link className="primary-button compact" href="/app/projects/new"><UploadCloud aria-hidden="true" />上传第一个项目</Link>}
            hint="支持 ZIP 格式，建议不超过 200MB"
          />
          <ProcessSteps title="项目流程预览" items={projectSteps} />
          <FeatureGrid title="完成后你将获得" items={projectFeatures} />
        </>
      ) : null}
      {!isLoading && !error && projects.length > 0 ? <DataSurface><ProjectTable projects={projects} /></DataSurface> : null}
    </AppPage>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="project-table">
      <div className="project-row head"><span>项目</span><span>状态</span><span>文件</span><span>更新时间</span><span /></div>
      {projects.map((project) => (
        <Link className="project-row" key={project.id} href={`/app/projects/${project.id}`}>
          <span><strong>{project.name}</strong><small>{project.description || "暂无描述"}</small></span>
          <span className={`status-badge ${project.status.toLowerCase()}`}>{projectStatusText(project.status)}</span>
          <span>{formatFileSize(project.fileSize)}</span>
          <span>{formatDate(project.updatedAt)}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

function projectStatusText(status: Project["status"]): string {
  return { UPLOADED: "已上传", QUEUED: "排队中", ANALYZING: "分析中", COMPLETED: "已完成", FAILED: "失败", DELETING: "删除中", DELETED: "已删除" }[status];
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
