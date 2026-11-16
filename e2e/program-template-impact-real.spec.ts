import path from "node:path";
import { expect, test } from "@playwright/test";
import { cleanup, db, evidence, observe, prepare, save, translate, type State } from "./helpers/publication-retirement-real";

test("1.22 · impacto y hueco reales; 422 conserva estado, reparar publica una sola versión", async ({ page }) => {
  let qa: Awaited<ReturnType<typeof prepare>> | undefined;
  const http = observe(page, "122");
  try {
    qa = await prepare("122", page);
    const { fixture: f, fixturePath, before, headers } = qa;
    const t = (source: string, params?: Record<string, string>) => translate(qa!.lang, source, params);
    const route = `/api/v1/program/templates/${f.template}`;
    const preview = await page.request.post(route + "/publish?preview=true", { headers });
    expect(preview.status()).toBe(200);
    const impact = await preview.json();
    expect(impact).toEqual({ pacientesQueCambian: 2, conPersonalizacionesFuturas: 1, semanasOmitidasIniciadas: 2 });
    expect(db("state", fixturePath)).toEqual(before);
    // La misma respuesta procede de API directa, gateway y proxy de Next.
    for (const base of ["http://127.0.0.1:5122", "http://localhost:5080"]) {
      const response = await page.request.post(base + route + "/publish?preview=true", { headers });
      expect(response.status()).toBe(200); expect(await response.json()).toEqual(impact);
    }
    await page.goto("/program/gestion?view=plantillas");
    await page.getByPlaceholder("Buscar por nombre o código...").fill(f.run + "-template");
    const row = page.getByRole("row").filter({ hasText: f.run + " template" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: t("Publicar"), exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t("Publicar la versión {version}", { version: "8" }), exact: true });
    await expect(dialog.locator("dd")).toHaveText(["2", "1"]);
    await expect(dialog).toContainText(t("{count} semanas ya iniciadas no se tocan.", { count: "2" }));
    await page.screenshot({ path: path.join(evidence, "122-impact.png") });
    const publish = dialog.getByRole("button", { name: t("Publicar versión {version}", { version: "8" }), exact: true });
    await publish.click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText(t("Completa estos días antes de publicar."));
    for (const summary of await alert.locator("summary").all()) await summary.click();
    await expect(alert.getByRole("listitem")).toHaveCount(1);
    await expect(alert).toContainText(t("Día {day} · Semana {week}", { day: "8", week: "2" }) + " · " + t("Lunes") + " · " + t("Podcast"));
    await expect(publish).toBeDisabled();
    expect(db("state", fixturePath)).toEqual(before);
    expect(http.traffic.filter(r => r.path === route + "/publish" && r.method === "POST").map(r => r.status)).toEqual([422]);
    await page.screenshot({ path: path.join(evidence, "122-gaps.png") });
    await dialog.getByRole("button", { name: t("Cancelar"), exact: true }).click();
    db("repair", fixturePath);
    await row.getByRole("button", { name: t("Publicar"), exact: true }).click();
    await expect(dialog.locator("dd")).toHaveText(["2", "1"]);
    await publish.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
    await expect(row.getByRole("button", { name: t("Archivar"), exact: true })).toBeVisible();
    const after: State = db("state", fixturePath);
    expect(after.template?.slice(0, 2)).toEqual(["Active", 8]);
    expect(after.template?.[2]).toBeTruthy();
    expect(after.weeks).toEqual(before.weeks);
    expect(http.errors).toEqual([]);
    save("122-after.json", after);
    save("122-result.json", { passed: true, impact, gaps: [{ day: 8, weekNumber: 2, weekday: 1, taskCode: "podcast" }],
      rejectedStatus: 422, rejectedStateUnchanged: true, publishedVersion: 8, snapshotsUnchanged: true,
      targets: [3000, 5080, 5122], mocks: 0, pageErrors: http.errors });
  } finally { if (qa) await cleanup(page.request, qa); }
});
