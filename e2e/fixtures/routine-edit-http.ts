import { expect, type Page } from "@playwright/test";
import { mockExerciseDemo } from "./exercise-demo-http";

/** usageCount es contrato pendiente: estos valores son sintéticos, nunca persistencia real. */
export async function mockRoutineEdit(page: Page, options: { usage?: unknown; delay?: number; english?: boolean; readonly?: boolean } = {}) {
  const base = await mockExerciseDemo(page);
  const calls: { body: unknown; status?: number }[] = [];
  const errors: string[] = [];
  let mode = "ok";
  page.on("pageerror", error => errors.push(error.message));
  if (options.english) {
    await page.context().addCookies([{ name: "copp_lang", value: "en", url: process.env.E2E_BASE_URL ?? "http://localhost:3067" }]);
    await page.route("**/api/auth/me/preferences", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ lang: "en", accentColor: null }) }));
  }
  if (options.readonly) await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: "qa222-reader", firstName: "QA", lastName: "Lectura", email: "qa222@example.invalid", roles: ["QA"], permissions: ["Wellness.View", "Media.View"],
  }) }));
  await page.route(`**/api/v1/wellness/exercise-routines/${base.routine.id}`, async route => {
    if (route.request().method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...base.routine, usageCount: options.usage }) });
    if (route.request().method() !== "PUT") return route.fallback();
    const call: typeof calls[number] = { body: route.request().postDataJSON() }; calls.push(call);
    const response = await page.request.put((process.env.E2E_ROUTINE_EDIT_SIM_URL ?? "http://127.0.0.1:4556") + `/api/v1/wellness/exercise-routines/${base.routine.id}`, {
      headers: { "x-mock-slug": "routine-edit", "x-qa-case": mode, "x-qa-delay-ms": String(options.delay ?? 0) }, data: call.body,
    });
    call.status = response.status(); await route.fulfill({ response });
  });
  await page.goto((process.env.E2E_BASE_URL ?? "http://localhost:3067") + "/wellness/exercise-routines");
  await expect(page.getByRole("cell", { name: base.routine.name, exact: true }).first()).toBeVisible();
  return { ...base, calls, errors, setMode: (value: string) => { mode = value; } };
}

export async function reviewRoutineEdit(page: Page, english = false) {
  await page.getByTitle(english ? "Edit" : "Editar", { exact: true }).click();
  await expect(page.locator("#routine-name")).toHaveValue("Rutina QA");
  await page.locator("#routine-name").fill("Rutina revisada QA");
  await page.getByRole("button", { name: english ? "Save changes" : "Guardar cambios", exact: true }).click();
  return page.getByRole("dialog", { name: english ? "Review the impact of this edit" : "Revisar impacto de la edición", exact: true });
}
