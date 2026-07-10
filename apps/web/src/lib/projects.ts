import { apiRequest } from "./api";

export type ProjectStatus =
  | "UPLOADED"
  | "QUEUED"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED"
  | "DELETING"
  | "DELETED";

export type TaskStatus = "PENDING" | "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  originalFileName: string;
  fileSize: number;
  status: ProjectStatus;
  failure: { code: string; message?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListResponse {
  items: Project[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AsyncTask {
  id: string;
  type: string;
  status: TaskStatus;
  progress?: number | null;
  failure: { code: string; message?: string | null } | null;
  createdAt?: string;
  completedAt?: string | null;
}

export interface ProjectAnalysis {
  id: string;
  projectId: string;
  summary: string;
  techStack: unknown;
  directoryTree: unknown;
  coreModules: unknown;
  entryFiles: unknown;
  statistics: unknown;
  analyzerVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadProjectInput {
  name: string;
  description?: string;
  file: File;
}

export interface UploadProjectResponse {
  project: Project;
  task: AsyncTask;
}

export function listProjects(page = 1, pageSize = 20): Promise<ProjectListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<ProjectListResponse>(`/projects?${params.toString()}`);
}

export function uploadProject(input: UploadProjectInput): Promise<UploadProjectResponse> {
  const formData = new FormData();
  formData.append("name", input.name);
  if (input.description) formData.append("description", input.description);
  formData.append("file", input.file);

  return apiRequest<UploadProjectResponse>("/projects", {
    method: "POST",
    body: formData,
  });
}

export function getProject(projectId: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${projectId}`);
}

export function getProjectAnalysis(projectId: string): Promise<ProjectAnalysis> {
  return apiRequest<ProjectAnalysis>(`/projects/${projectId}/analysis`);
}

export function getTask(taskId: string): Promise<AsyncTask> {
  return apiRequest<AsyncTask>(`/tasks/${taskId}`);
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}
