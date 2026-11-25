import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const accountId = "0545a27b-9c38-4fb1-a0f5-2bfc71ff93a3";
const legalPath = "/api/v1/legal-acceptances";

async function mockHistory(page: Page, options: { permissions: string[]; english?: boolean; fail?: boolean }) {
  let unavailable = Boolean(options.fail);
  const calls: URL[] = [];
  if (options.english) {
    await page.context().addCookies([{ name: "copp_lang", value: "en", url: process.env.E2E_BASE_URL ?? "http://localhost:3000" }]);
  }
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    switch (url.pathname) {
      case "/api/auth/refresh": return reply({ accessToken: "synthetic-erp-session", expiresIn: 3600 });
      case "/api/auth/me": return reply({ id: "auditor-qa", email: "auditor@example.invalid", firstName: "QA",
        lastName: "Historial", roles: [], permissions: options.permissions });
      case "/api/auth/me/preferences": return reply({ lang: options.english ? "en" : "es" });
      case "/api/v1/me/context": return reply({ userId: "auditor-qa", employeeId: null, professionalId: null,
        organization: null, isProfessional: false, onboardingCompleted: true, clinics: [], activeClinicId: null });
      case legalPath: {
        calls.push(url);
        if (unavailable) return reply({ detail: "Servicio de prueba temporalmente inactivo" }, 503);
        const pageNumber = Number(url.searchParams.get("page") ?? 1);
        const filtered = url.searchParams.has("accountId");
        return reply({ items: [{ receiptId: `legal-receipt-${pageNumber}`, accountId, documentTitle: "Términos sintéticos",
          scope: "account-terms", documentCode: "test-terms-es", locale: "es", version: pageNumber === 1 ? "2.0" : "1.0",
          versionId: `version-${pageNumber}`, acceptedAt: "2026-11-25T16:10:00Z", ip: "192.0.2.40", userAgent: "Browser QA" }],
        total: filtered ? 1 : 26, page: pageNumber, pageSize: 25 });
      }
      case `${legalPath}/export`:
        calls.push(url);
        return route.fulfill({ status: 200, contentType: "text/csv; charset=utf-8",
          body: `accountId,documentTitle\r\n${accountId},Términos sintéticos\r\n` });
      default: return reply([]);
    }
  });
  return { calls, recover: () => { unavailable = false; } };
}

test("consulta con teclado y descarga el CSV con los mismos filtros", async ({ page }) => {
  const api = await mockHistory(page, { permissions: ["LegalDocuments.View", "LegalAcceptances.View", "LegalAcceptances.Export"] });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Documentación", exact: true }).click();
  await page.getByRole("button", { name: "Historial de aceptaciones", exact: true }).press("Enter");
  await expect(page.getByRole("cell", { name: "legal-receipt-1" })).toBeVisible();
  const next = page.getByRole("button", { name: "Siguiente", exact: true });
  await next.press("Enter");
  await expect(page.getByRole("cell", { name: "legal-receipt-2" })).toBeVisible();
  await expect(next).toBeFocused();
  await page.getByLabel("ID de cuenta", { exact: true }).fill(accountId);
  await page.getByLabel("Código del documento", { exact: true }).fill("test-terms-es");
  await page.getByLabel("Versión", { exact: true }).fill("2.0");
  await page.getByLabel("Desde (UTC)", { exact: true }).fill("2026-11-25");
  await page.getByLabel("Hasta (UTC)", { exact: true }).fill("2026-11-25");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).press("Enter");
  await expect(page.getByRole("cell", { name: "legal-receipt-1" })).toBeVisible();
  expect(Object.fromEntries(api.calls.at(-1)!.searchParams)).toEqual({ accountId, documentCode: "test-terms-es",
    version: "2.0", from: "2026-11-25T00:00:00.000Z", before: "2026-11-26T00:00:00.000Z", page: "1" });
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Descargar CSV", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("legal-acceptances.csv");
  expect(await readFile((await download.path())!, "utf8")).toContain(`${accountId},Términos sintéticos`);
  const listFilters = new URLSearchParams(api.calls.at(-2)!.search);
  listFilters.delete("page");
  expect(api.calls.at(-1)?.pathname).toBe(`${legalPath}/export`);
  expect(api.calls.at(-1)?.searchParams.toString()).toBe(listFilters.toString());
});

test("permite el reintento en inglés sin ofrecer exportación", async ({ page }) => {
  const api = await mockHistory(page, { permissions: ["LegalAcceptances.View"], english: true, fail: true });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Documentation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acceptance history", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Acceptance history" }).getByRole("alert"))
    .toHaveText("We could not load the acceptances.");
  await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
  api.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("cell", { name: "legal-receipt-1" })).toBeVisible();
});

test("el permiso de documentos legales por sí solo no consulta aceptaciones", async ({ page }) => {
  const api = await mockHistory(page, { permissions: ["LegalDocuments.View"] });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Documentación", exact: true }).click();
  await expect(page.getByRole("button", { name: "Historial de aceptaciones" })).toHaveCount(0);
  expect(api.calls).toHaveLength(0);
});
