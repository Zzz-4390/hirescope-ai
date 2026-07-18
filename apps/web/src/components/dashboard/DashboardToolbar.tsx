"use client";

import { Check, CheckCircle2, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Project, ProjectStatus } from "../../lib/projects";
import styles from "./Dashboard.module.css";

const PROJECT_STATUS_LABELS: Partial<Record<ProjectStatus, string>> = {
  UPLOADED: "已上传",
  QUEUED: "等待分析",
  ANALYZING: "分析中",
  COMPLETED: "分析完成",
  FAILED: "分析失败",
  DELETING: "删除中",
  DELETED: "已删除",
};

export function DashboardToolbar({ projects, selectedId, onSelect }: { projects: Project[]; selectedId: string; onSelect: (id: string) => void }) {
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const projectSearchInputRef = useRef<HTMLInputElement>(null);
  const selectedProject = projects.find((project) => project.id === selectedId) ?? projects[0];
  const visibleProjects = projects.filter((project) => project.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!isProjectMenuOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) setIsProjectMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProjectMenuOpen(false);
        projectMenuTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);
    if (projects.length > 0) projectSearchInputRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProjectMenuOpen, projects.length]);

  const closeProjectMenu = () => {
    setIsProjectMenuOpen(false);
    setSearchQuery("");
  };

  const selectProject = (projectId: string) => {
    onSelect(projectId);
    closeProjectMenu();
  };

  return (
    <header className={`${styles.toolbar} app-context-toolbar`} aria-label="项目上下文">
      <div className={styles.toolbarInner}>
        <span className={styles.currentProjectLabel}>当前项目</span>
        <div className={projects.length === 0 ? styles.emptyProjectSelect : styles.projectSelect} ref={projectMenuRef}>
          <button
            ref={projectMenuTriggerRef}
            className={styles.projectSelectTrigger}
            type="button"
            aria-label={`项目选择器：${selectedProject?.name ?? "暂无项目"}`}
            aria-expanded={isProjectMenuOpen}
            aria-haspopup="dialog"
            onClick={() => setIsProjectMenuOpen((open) => !open)}
          >
            <strong>{selectedProject?.name ?? "暂无项目"}</strong>
            <ChevronDown aria-hidden="true" />
          </button>
          {isProjectMenuOpen ? (
            projects.length === 0 ? (
              <div className={styles.emptyProjectMenu} role="dialog" aria-label="暂无项目提示">
                <strong>当前暂无项目</strong>
                <p>上传第一个 ZIP 项目后，即可开始项目分析。</p>
                <Link href="/app/projects/new" onClick={closeProjectMenu}>上传第一个项目</Link>
              </div>
            ) : (
              <div className={styles.projectMenu} role="dialog" aria-label="切换项目">
                <strong className={styles.projectMenuTitle}>切换项目</strong>
                <label className={styles.projectSearch}>
                  <Search aria-hidden="true" />
                  <input ref={projectSearchInputRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索项目名称" aria-label="搜索项目名称" />
                </label>
                <div className={styles.projectMenuList} role="listbox" aria-label="项目列表">
                  {visibleProjects.map((project) => {
                    const isSelected = project.id === selectedProject?.id;
                    return (
                      <button key={project.id} className={`${styles.projectMenuItem} ${isSelected ? styles.projectMenuItemSelected : ""}`} type="button" role="option" aria-selected={isSelected} onClick={() => selectProject(project.id)}>
                        <span><strong>{project.name}</strong><small>{getProjectStatusLabel(project.status)}</small></span>
                        {isSelected ? <Check aria-label="当前项目" /> : null}
                      </button>
                    );
                  })}
                  {visibleProjects.length === 0 ? <p className={styles.projectMenuEmpty}>未找到匹配项目</p> : null}
                </div>
                <div className={styles.projectMenuFooter}>
                  <Link href="/app/projects" onClick={closeProjectMenu}>查看全部项目</Link>
                  <Link href="/app/projects/new" onClick={closeProjectMenu}>上传项目</Link>
                </div>
              </div>
            )
          ) : null}
        </div>
        <span className={`${styles.contextStatus} ${selectedProject?.status === "COMPLETED" ? styles.contextStatusCompleted : ""}`}>
          {selectedProject?.status === "COMPLETED" ? <CheckCircle2 aria-hidden="true" /> : null}
          {selectedProject ? getProjectStatusLabel(selectedProject.status) : "暂无项目"}
        </span>
      </div>
    </header>
  );
}

function getProjectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}
