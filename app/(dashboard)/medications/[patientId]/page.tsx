import { MedicationWorkspacePage } from "@/features/medications/components/medication-workspace";

export default async function MedicationPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ tab?: string; action?: string }>;
}) {
  const [{ patientId }, query] = await Promise.all([params, searchParams]);
  return (
    <MedicationWorkspacePage
      patientId={patientId}
      initialTab={query.tab === "history" ? "history" : "today"}
      initialCreate={query.action === "create"}
    />
  );
}
