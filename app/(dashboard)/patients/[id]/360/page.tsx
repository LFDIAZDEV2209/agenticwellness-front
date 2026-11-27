import { ProgramPatientProfile360 } from "@/features/program/components/program-patient-profile360";
import { MotorTimelineLink } from "@/features/wellness/components/motor-timeline";

export default async function PatientProfile360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-w-0 p-4 sm:p-6">
      <MotorTimelineLink patientId={id} />
      <ProgramPatientProfile360 key={id} patientId={id} />
    </div>
  );
}
