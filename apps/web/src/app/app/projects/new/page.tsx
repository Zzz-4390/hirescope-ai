"use client";

import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { uploadProject } from "../../../../lib/projects";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState("");

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
    <section className="app-page narrow">
      <div className="page-heading">
        <div>
          <span>项目上传</span>
          <h1>上传 ZIP 项目</h1>
          <p>上传后会自动创建项目分析任务，请保留页面或稍后回到项目详情查看结果。</p>
        </div>
      </div>

      <form className="upload-card" onSubmit={handleSubmit}>
        <label className="app-field">
          <span>项目名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：个人博客系统"
            maxLength={120}
            required
          />
        </label>
        <label className="app-field">
          <span>项目描述</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="可选，说明项目背景或你希望重点分析的内容"
            maxLength={5000}
          />
        </label>
        <label className="file-drop">
          <UploadCloud aria-hidden="true" />
          <strong>{file ? file.name : "选择 ZIP 文件"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "仅支持 .zip，最大大小以后端限制为准"}</span>
          <input
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
        </label>

        {error ? <p className="app-banner error" role="alert">{error}</p> : null}

        <button className="primary-button compact" type="submit" disabled={status !== "idle"}>
          {status === "uploading" ? "上传中..." : "上传并开始分析"}
        </button>
      </form>
    </section>
  );
}
