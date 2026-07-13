"use client";

import {
  AlertCircle,
  ChevronDown,
  CloudUpload,
  CodeXml,
  FileArchive,
  FileCheck2,
  FileText,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, type FormEvent, type KeyboardEvent, useRef, useState } from "react";

import { uploadProject } from "../../../../lib/projects";
import styles from "./NewProjectPage.module.css";

const MAX_PROJECT_NAME_LENGTH = 100;
const MAX_ZIP_SIZE = 50 * 1024 * 1024;

const uploadSteps = [
  { title: "上传项目", description: "提交 ZIP 文件，开始项目分析", icon: CloudUpload },
  { title: "项目分析", description: "理解项目结构，识别技术栈与核心模块", icon: CodeXml },
  { title: "AI 代码审查", description: "深度审查代码质量，发现潜在问题与优化建议", icon: FileCheck2 },
  { title: "模拟面试", description: "基于项目生成个性化面试题与追问", icon: MessageSquareText },
  { title: "能力报告", description: "生成综合评估报告，助力你管理与成长", icon: FileText },
] as const;

function validateZipFile(file: File): string {
  if (!file.name.toLowerCase().endsWith(".zip")) return "只能上传 .zip 文件";
  if (file.size > MAX_ZIP_SIZE) return "ZIP 文件不能超过 50MB";
  return "";
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export default function NewProjectPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState("");
  const showDescription = isDescriptionExpanded || description.length > 0;
  const fileError = file ? validateZipFile(file) : "";
  const canSubmit = name.trim().length > 0 && Boolean(file) && !fileError && status === "idle";

  function openFilePicker() {
    if (status === "idle") fileInputRef.current?.click();
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setError(nextFile ? validateZipFile(nextFile) : "");
  }

  function removeFile() {
    setFile(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (status !== "idle") return;
    selectFile(event.dataTransfer.files[0] ?? null);
  }

  function handleDropZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openFilePicker();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !file) return;

    setError("");
    setStatus("uploading");
    try {
      const response = await uploadProject({
        name: name.trim(),
        description: description.trim() || undefined,
        file,
      });
      sessionStorage.setItem(`hirescope.projectTask.${response.project.id}`, response.task.id);
      router.push(`/app/projects/${response.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目上传失败，请稍后重试");
      setStatus("idle");
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <nav className={styles.breadcrumb} aria-label="面包屑">
          <Link href="/app/projects">项目</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">上传项目</span>
        </nav>
        <h1>上传 ZIP 项目</h1>
        <p>上传 ZIP 项目，AI 将自动分析代码结构与业务逻辑，生成专业的分析结果。</p>
      </header>

      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={handleSubmit} noValidate>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="project-name">
              项目名称 <span aria-hidden="true">*</span>
            </label>
            <div className={styles.nameInputShell}>
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：个人博客系统"
                maxLength={MAX_PROJECT_NAME_LENGTH}
                disabled={status === "uploading"}
                required
              />
              <small aria-live="polite">{name.length} / {MAX_PROJECT_NAME_LENGTH}</small>
            </div>
          </div>

          {showDescription ? (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="project-description">项目描述（可选）</label>
              <div className={styles.descriptionField}>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="说明项目背景或你希望重点分析的内容"
                  maxLength={5000}
                  disabled={status === "uploading"}
                  autoFocus={isDescriptionExpanded && description.length === 0}
                />
                <small>{description.length} / 5000</small>
              </div>
            </div>
          ) : (
            <button
              className={styles.descriptionToggle}
              type="button"
              disabled={status === "uploading"}
              aria-expanded="false"
              onClick={() => setIsDescriptionExpanded(true)}
            >
              <span><Plus aria-hidden="true" />添加项目描述（可选）</span>
              <ChevronDown aria-hidden="true" />
            </button>
          )}

          <div
            className={`${styles.fileDrop} ${isDragging ? styles.dragging : ""} ${file ? styles.hasFile : ""} ${fileError ? styles.invalidFile : ""} ${status === "uploading" ? styles.uploading : ""}`}
            role="button"
            tabIndex={status === "uploading" ? -1 : 0}
            aria-label={file ? "更换 ZIP 文件" : "选择 ZIP 文件"}
            aria-disabled={status === "uploading"}
            aria-busy={status === "uploading"}
            onClick={openFilePicker}
            onKeyDown={handleDropZoneKeyDown}
            onDragEnter={(event) => {
              event.preventDefault();
              if (status === "idle") setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (status === "idle") setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            {status === "uploading" ? (
              <>
                <span className={styles.uploadIcon}><LoaderCircle aria-hidden="true" /></span>
                <strong>正在上传并创建分析任务</strong>
                <small>请保持页面开启，上传完成后将自动进入项目详情。</small>
              </>
            ) : file ? (
              <>
                <span className={styles.fileIcon}><FileArchive aria-hidden="true" /></span>
                <div className={styles.fileSummary}>
                  <strong>{file.name}</strong>
                  <small>{formatFileSize(file.size)} · ZIP 压缩文件</small>
                </div>
                <div className={styles.fileActions}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openFilePicker();
                    }}
                  >
                    更换文件
                  </button>
                  <button
                    type="button"
                    aria-label="移除已选文件"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFile();
                    }}
                  >
                    <X aria-hidden="true" />移除
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className={styles.uploadIcon}><CloudUpload aria-hidden="true" /></span>
                <strong>拖拽 ZIP 文件到此处，或点击<span>选择文件</span></strong>
                <small>支持 .zip，最大 50MB</small>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            disabled={status === "uploading"}
            onClick={(event) => { event.currentTarget.value = ""; }}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />

          <ul className={styles.assurances} aria-label="上传说明">
            <li><ShieldCheck aria-hidden="true" />仅用于项目分析</li>
            <li><LockKeyhole aria-hidden="true" />全程安全加密</li>
            <li><Trash2 aria-hidden="true" />可随时删除</li>
          </ul>

          {error ? (
            <div className={styles.error} role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={openFilePicker}>重新选择文件</button>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button className={styles.primaryAction} type="submit" disabled={!canSubmit}>
              {status === "uploading" ? <LoaderCircle aria-hidden="true" /> : null}
              {status === "uploading" ? "上传中..." : "上传并开始分析"}
            </button>
            <Link className={styles.secondaryAction} href="/app/projects" aria-disabled={status === "uploading"}>
              返回项目列表
            </Link>
          </div>
        </form>

        <aside className={styles.aside}>
          <section className={styles.processCard}>
            <div className={styles.processContent}>
              <h2>上传后流程</h2>
              <ol className={styles.steps}>
                {uploadSteps.map(({ title, description: stepDescription, icon: Icon }, index) => (
                  <li className={index === 0 ? styles.currentStep : ""} key={title}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <span className={styles.stepIcon}><Icon aria-hidden="true" /></span>
                    <div><strong>{title}</strong><p>{stepDescription}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className={styles.securityNote}>
              <span><ShieldCheck aria-hidden="true" /></span>
              <div>
                <strong>代码仅用于安全分析</strong>
                <p>代码不会被公开、传播或用于安全分析之外的用途。</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
