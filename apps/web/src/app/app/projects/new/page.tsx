"use client";

import {
  ArrowLeft,
  CloudUpload,
  CodeXml,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { uploadProject } from "../../../../lib/projects";
import styles from "./NewProjectPage.module.css";

const uploadSteps = [
  { title: "上传项目", description: "提交 ZIP 文件，开始项目分析", icon: CloudUpload },
  { title: "项目分析", description: "理解项目结构，识别技术栈与核心模块", icon: CodeXml },
  { title: "AI 代码审查", description: "深度审查代码质量，发现潜在问题与优化建议", icon: FileCheck2 },
  { title: "模拟面试", description: "基于项目生成个性化面试题与追问", icon: MessageSquareText },
  { title: "能力报告", description: "生成综合评估报告，助力你管理与成长", icon: FileText },
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState("");
  const showDescription = isDescriptionExpanded || description.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!file) {
      setError("请选择 ZIP 项目文件");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("只能上传 .zip 文件");
      return;
    }

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
        <span>项目上传</span>
        <h1>上传 ZIP 项目</h1>
        <p>上传 ZIP 项目，AI 将自动分析代码结构与业务逻辑，生成专业的分析结果。</p>
      </header>

      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <label className={styles.filledField}>
            <span>项目名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：个人博客系统"
              maxLength={120}
              required
            />
          </label>

          {showDescription ? (
            <label className={`${styles.filledField} ${styles.descriptionField}`}>
              <span>项目描述（可选）</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="说明项目背景或你希望重点分析的内容"
                maxLength={5000}
              />
              <small>{description.length} / 5000</small>
            </label>
          ) : (
            <button
              className={styles.descriptionToggle}
              type="button"
              onClick={() => setIsDescriptionExpanded(true)}
            >
              <Plus aria-hidden="true" />
              添加项目描述（可选）
            </button>
          )}

          <label
            className={`${styles.fileDrop} ${isDragging ? styles.dragging : ""} ${file ? styles.hasFile : ""}`}
            onDragEnter={() => setIsDragging(true)}
            onDragOver={() => setIsDragging(true)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={() => setIsDragging(false)}
          >
            <span className={styles.uploadIcon}><CloudUpload aria-hidden="true" /></span>
            <strong>
              {file ? file.name : <>拖拽 ZIP 文件到此处，或点击<span>选择文件</span></>}
            </strong>
            <small>
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · 点击或拖拽可重新选择` : "支持 .zip，最大大小以后端限制为准"}
            </small>
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>

          <ul className={styles.assurances} aria-label="上传说明">
            <li><ShieldCheck aria-hidden="true" />仅用于项目分析</li>
            <li><LockKeyhole aria-hidden="true" />全程安全加密</li>
            <li><Trash2 aria-hidden="true" />可随时删除</li>
          </ul>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.actions}>
            <button className={styles.primaryAction} type="submit" disabled={status !== "idle"}>
              <Sparkles aria-hidden="true" />
              {status === "uploading" ? "上传中..." : "上传并开始分析"}
            </button>
            <Link className={styles.secondaryAction} href="/app/projects">
              <ArrowLeft aria-hidden="true" />返回项目列表
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
