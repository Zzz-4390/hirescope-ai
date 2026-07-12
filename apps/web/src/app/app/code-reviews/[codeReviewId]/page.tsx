import { CodeReviewDetailClient } from "../../../../components/CodeReviewDetailClient";

interface CodeReviewDetailPageProps {
  params: Promise<{ codeReviewId: string }>;
  searchParams: Promise<{ projectId?: string }>;
}

export default async function CodeReviewDetailPage({ params, searchParams }: CodeReviewDetailPageProps) {
  const [{ codeReviewId }, { projectId }] = await Promise.all([params, searchParams]);
  return <CodeReviewDetailClient codeReviewId={codeReviewId} projectId={projectId ?? ""} />;
}
