import { InterviewHistoryClient } from "../../../../../components/InterviewHistoryClient";

interface ProjectInterviewsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectInterviewsPage({ params }: ProjectInterviewsPageProps) {
  const { id } = await params;
  return <InterviewHistoryClient projectId={id} />;
}
