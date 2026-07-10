import { InterviewReportClient } from "../../../../../components/InterviewReportClient";

interface InterviewReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function InterviewReportPage({ params }: InterviewReportPageProps) {
  const { id } = await params;
  return <InterviewReportClient interviewId={id} />;
}
