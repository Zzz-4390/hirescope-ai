import { CodeReviewClient } from "../../../../../components/CodeReviewClient";

interface ProjectReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectReviewPage({ params }: ProjectReviewPageProps) {
  const { id } = await params;
  return <CodeReviewClient projectId={id} />;
}
