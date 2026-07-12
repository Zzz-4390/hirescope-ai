"use client";

import { ChevronDown, Folder, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { CurrentUser } from "../../lib/auth";
import type { Project } from "../../lib/projects";
import styles from "./Dashboard.module.css";

export function DashboardToolbar({ projects, selectedId, user, onSelect }: { projects: Project[]; selectedId: string; user: CurrentUser | null; onSelect: (id: string) => void }) {
  const name = user?.displayName || user?.email || "用户";
  const [isEmptyProjectMenuOpen, setIsEmptyProjectMenuOpen] = useState(false);

  return (
    <header className={styles.toolbar}>
      {projects.length === 0 ? (
        <div className={styles.emptyProjectSelect}>
          <button
            type="button"
            aria-expanded={isEmptyProjectMenuOpen}
            aria-haspopup="dialog"
            onClick={() => setIsEmptyProjectMenuOpen((open) => !open)}
          >
            <Folder aria-hidden="true" />
            <span>暂无项目</span>
            <ChevronDown aria-hidden="true" />
          </button>
          {isEmptyProjectMenuOpen ? (
            <div className={styles.emptyProjectMenu} role="dialog" aria-label="暂无项目提示">
              <strong>当前暂无项目</strong>
              <p>上传第一个 ZIP 项目后，即可开始项目分析。</p>
              <Link href="/app/projects/new" onClick={() => setIsEmptyProjectMenuOpen(false)}>上传第一个项目</Link>
            </div>
          ) : null}
        </div>
      ) : (
        <label className={styles.projectSelect}>
          <Folder aria-hidden="true" />
          <select aria-label="当前项目" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
      )}
      <div className={styles.toolbarActions}>
        <Link className={styles.uploadButton} href="/app/projects/new"><Upload aria-hidden="true" />上传项目</Link>
        <span className={styles.avatar} title={name}>{name.slice(0, 1).toUpperCase()}</span>
      </div>
    </header>
  );
}
