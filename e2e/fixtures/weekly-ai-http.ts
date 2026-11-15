import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockWeekAgendaEditor } from "./week-agenda-editor-http";
import { profileEnrollmentId } from "./profile360-http";

const sim = process.env.E2E_WEEKLY_SIM_URL ?? "http://127.0.0.1:4539";
export async function setupWeeklyAi(page: Page, options: { mode?: string; manage?: boolean; noEdit?: boolean; noView?: boolean; english?: boolean; delay?: number } = {}) {
  const http = await mockWeekAgendaEditor(page, { readOnly: !options.manage || options.noEdit, english: options.english,
    additionalPermissions: [ ...options.noView ? [] : ["Program.AiView"], ...options.manage ? ["Program.AiManage"] : [] ] });
  const headers = { "x-mock-slug": "weekly-erp", "x-mock-session": `qa48-${randomUUID()}`, "x-qa-local": "synthetic" };
  const seed = await page.request.post(sim + "/__qa/weekly", { headers, data: { enrollmentId: profileEnrollmentId, week: http.details.get(2) } });
  expect(seed.status()).toBe(200);
  const calls: { method: string; path: string; body: unknown; status?: number; outcome?: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await page.route("**/api/v1/program/erp/enrollments/*/weeks/*/ai-suggestions**", async route => {
    const request = route.request(), url = new URL(request.url());
    const body = request.method() === "POST" ? request.postDataJSON() : undefined;
    const call: typeof calls[number] = { method: request.method(), path: url.pathname, body: body ?? null };
    calls.push(call);
    const response = await page.request.fetch(sim + url.pathname + url.search, { method: request.method(),
      headers: { ...headers, "x-qa-case": options.mode ?? "ok", "x-qa-delay-ms": String(options.delay ?? 0) }, ...(body ? { data: body } : {}) });
    const result = await response.json(); call.status = response.status(); call.outcome = result.status;
    if (result.week) http.details.set(2, result.week);
    await route.fulfill({ response });
  });
  await page.route(`**/api/v1/program/enrollments/${profileEnrollmentId}/week/2`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await page.request.get(sim + "/__qa/weekly", { headers });
    const state = await response.json(); http.details.set(2, state.week);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.week) });
  });
  const agenda = await http.open();
  const panel = page.getByTestId("weekly-ai-suggestions");
  return { http, calls, errors, agenda, panel, snapshot: async () => (await page.request.get(sim + "/__qa/weekly", { headers })).json() };
}
