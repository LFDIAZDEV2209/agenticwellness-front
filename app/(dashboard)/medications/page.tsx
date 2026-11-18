import { MedicationDirectory } from "@/features/medications/components/medication-directory";
export default async function MedicationsPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const params=await searchParams;
  return <MedicationDirectory initialView={params.view === "patients" ? "patients" : "overview"} />;
}
