import { MotorTimeline } from "@/features/wellness/components/motor-timeline";

export default async function MotorTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MotorTimeline patientId={id} />;
}
