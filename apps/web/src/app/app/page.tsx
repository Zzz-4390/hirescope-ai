"use client";

import { ArrowRight, FolderOpen, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { type Project, listProjects } from "../../lib/projects";

export default function AppHomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    listProjects()
      .then((response) => {
        if (!mounted) return;
        setProjects(response.items);
        setError("");
      })
      .catch((cause) => {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "项目列表加载失败");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="app-page">
      <div className="page-heading">
        <div>
          <span>工作台</span>
          <h1>我的项目</h1>
          <p>上传 ZIP 项目后，系统会自动完成技术栈、目录结构和核心模块分析。</p>
        </div>
        <Link className="primary-button compact" href="/app/projects/new">
          <Plus aria-hidden="true" />
          上传项目
        </Link>
      </div>

      {error ? <p className="app-banner error" role="alert">{error}</p> : null}

      {isLoading ? (
        <div className="state-panel">
          <RefreshCw aria-hidden="true" />
          <span>正在加载项目列表...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-panel">
          <FolderOpen aria-hidden="true" />
          <h2>还没有项目</h2>
          <p>上传一个 ZIP 项目，完成本次 MVP 的项目分析闭环。</p>
          <Link className="primary-button compact" href="/app/projects/new">立即上传</Link>
        </div>
      ) : (
        <div className="project-table">
          <div className="project-row head">
            <span>项目</span>
            <span>状态</span>
            <span>文件</span>
            <span>更新时间</span>
            <span />
          </div>
          {projects.map((project) => (
            <Link className="project-row" key={project.id} href={`/app/projects/${project.id}`}>
              <span>
                <strong>{project.name}</strong>
                <small>{project.description || "暂无描述"}</small>
              </span>
              <StatusBadge status={project.status} />
              <span>{formatFileSize(project.fileSize)}</span>
              <span>{formatDate(project.updatedAt)}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: Project["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{projectStatusText(status)}</span>;
}

function projectStatusText(status: Project["status"]): string {
  const map: Record<Project["status"], string> = {
    UPLOADED: "已上传",
    QUEUED: "排队中",
    ANALYZING: "分析中",
    COMPLETED: "已完成",
    FAILED: "失败",
    DELETING: "删除中",
    DELETED: "已删除",
  };
  return map[status] ?? status;
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
