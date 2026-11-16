import { expect, type Page } from "@playwright/test";
import { mockPatientsHttp, patientWorkspaceRows, patientWorkspaceUserId } from "./patients-http";
import type { ExerciseRoutineListItem } from "../../features/wellness/types";

export const routine221: ExerciseRoutineListItem = {
  id: "00000000-0000-4000-8000-000000002211", name: "Movilidad y fuerza progresiva", description: "Rutina sintética de QA",
  difficulty: "Facil", estimatedMinutes: 25, category: "Fuerza", status: "Active", targetMuscles: null, equipment: null, createdAt: "2026-11-15",
};
export async function setupPatientRoutines(page: Page, options: { english?: boolean; role?: string; noEdit?: boolean; delay?: number } = {}) {
  const permissions = ["Patients.View", "Program.View", "Wellness.View", ...(options.noEdit ? [] : ["Program.Edit"])];
  const base = await mockPatientsHttp(page, { english: options.english, permissions });
  const calls: { body: unknown; status?: number }[] = [];
  const catalogCalls: Record<string, string>[] = [];
  const errors: string[] = [];
  let mode = "ok", catalogFail = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: patientWorkspaceUserId, email: "qa221@example.invalid", firstName: "Sofía", lastName: "Pruebas", roles: [options.role ?? "Admin"], permissions,
  }) }));
  await page.route("**/api/v1/wellness/exercise-routines**", async route => {
    const query = Object.fromEntries(new URL(route.request().url()).searchParams); catalogCalls.push(query);
    if (catalogFail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Catálogo no disponible" }) });
    const data = query.search ? [] : Number(query.page) === 2 ? [{ ...routine221, id: "00000000-0000-4000-8000-000000002212", name: "Rutina de recuperación con nombre suficientemente largo para comprobar el ajuste de texto" }]
      : [routine221, { ...routine221, id: "00000000-0000-4000-8000-000000002213", name: "Borrador no seleccionable", status: "Draft" }];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data, total: 9, page: Number(query.page), pageSize: 8, totalPages: query.search ? 0 : 2 }) });
  });
  await page.route("**/api/v1/program/content/bulk-assign-patient-routines", async route => {
    const body = route.request().postDataJSON(); const call: typeof calls[number] = { body }; calls.push(call);
    const response = await page.request.post((process.env.E2E_ROUTINE_SIM_URL ?? "http://127.0.0.1:4554") + "/api/v1/program/content/bulk-assign-patient-routines", {
      headers: { "x-mock-slug": "routines-erp", "x-qa-case": mode, "x-qa-delay-ms": String(options.delay ?? 0) }, data: body,
    }); call.status = response.status(); await route.fulfill({ response });
  });
  await page.goto((process.env.E2E_BASE_URL ?? "http://localhost:3067") + "/patients?tab=estado-clinico");
  await expect(page.getByRole("cell", { name: patientWorkspaceRows[0].firstName + " " + patientWorkspaceRows[0].lastName, exact: false }).first()).toBeVisible();
  return { ...base, calls, catalogCalls, errors, setMode: (value: string) => { mode = value; }, setCatalogFail: (value: boolean) => { catalogFail = value; } };
}
export async function openPatientRoutines(page: Page, english = false) {
  for (const patient of patientWorkspaceRows.slice(0, 2))
    await page.getByRole("row").filter({ hasText: patient.firstName + " " + patient.lastName }).getByRole("checkbox").first().check();
  await page.getByRole("button", { name: english ? "Assign routine" : "Asignar rutina", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: english ? "Assign routine in bulk" : "Asignar rutina en bloque", exact: true });
  await expect(dialog.getByRole("radio").first()).toBeVisible();
  return dialog;
}
