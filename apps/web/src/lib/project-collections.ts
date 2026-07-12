import { type Interview, listInterviews } from "./interviews";
import { type Project, listProjects } from "./projects";

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    totalPages: number;
  };
}

export interface ProjectInterviewItem {
  project: Project;
  interview: Interview;
}

async function collectAllPages<T>(loadPage: (page: number) => Promise<PaginatedResponse<T>>): Promise<T[]> {
  const firstPage = await loadPage(1);
  if (firstPage.pagination.totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) => loadPage(index + 2)),
  );
  return firstPage.items.concat(remainingPages.flatMap((page) => page.items));
}

export function listAllProjects(): Promise<Project[]> {
  return collectAllPages((page) => listProjects(page));
}

export async function listAllProjectInterviews(projects: Project[]): Promise<ProjectInterviewItem[]> {
  const projectInterviews = await Promise.all(projects.map(async (project) => {
    const interviews = await collectAllPages((page) => listInterviews(project.id, page));
    return interviews.map((interview) => ({ project, interview }));
  }));

  return projectInterviews.flat().sort(
    (left, right) => new Date(right.interview.updatedAt).getTime() - new Date(left.interview.updatedAt).getTime(),
  );
}
