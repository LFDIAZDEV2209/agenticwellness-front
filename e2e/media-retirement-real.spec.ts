import path from "node:path";
import { expect, test } from "@playwright/test";
import { cleanup, db, evidence, observe, prepare, save, translate, type State } from "./helpers/publication-retirement-real";

test("1.23 · DELETE 409, sustituto válido obligatorio y retiro conserva historia/personalización", async ({ page }) => {
  let qa: Awaited<ReturnType<typeof prepare>> | undefined;
  const http = observe(page, "123");
  try {
    qa = await prepare("123", page);
    const { fixture: f, fixturePath, before, headers } = qa;
    const t = (source: string, params?: Record<string, string>) => translate(qa!.lang, source, params);
    const route = `/api/v1/media/${f.original}`;
    const preview = await page.request.get(route + "/retirement-impact", { headers });
    expect(preview.status()).toBe(200);
    const impact = await preview.json();
    expect(impact).toEqual({ pacientes: 2, plantillas: 1 });
    for (const base of ["http://127.0.0.1:5122", "http://localhost:5080"]) {
      const response = await page.request.get(base + route + "/retirement-impact", { headers });
      expect(response.status()).toBe(200); expect(await response.json()).toEqual(impact);
    }
    const deletion = await page.request.delete(route, { headers });
    expect(deletion.status()).toBe(409);
    expect((await deletion.json()).detail).toContain("MEDIA_REPLACEMENT_REQUIRED");
    expect(db("state", fixturePath)).toEqual(before);
    for (const key of ["wrongType", "unpublished", "original"]) {
      const invalid = await page.request.post(route + "/unpublish", { headers, data: { replacementMediaId: f[key] } });
      expect(invalid.status()).toBe(422);
      expect((await invalid.json()).detail).toContain("MEDIA_REPLACEMENT_INVALID");
      expect(db("state", fixturePath)).toEqual(before);
    }
    await page.goto("/media");
    await page.getByRole("searchbox", { name: t("Buscar podcasts"), exact: true }).fill(f.run + " original");
    await page.getByRole("button", { name: t("Acciones de {title}", { title: f.run + " original" }), exact: true }).click();
    await page.getByRole("menuitem", { name: t("Eliminar"), exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `${t("Eliminar")} «${f.run} original»`, exact: true });
    await expect(dialog.locator("dd")).toHaveText(["2", "1"]);
    await expect(dialog.getByRole("button", { name: t("Eliminar"), exact: true })).toBeDisabled();
    await expect(dialog).toContainText(t("Borrador · no se modifica"));
    await page.screenshot({ path: path.join(evidence, "123-replacement-required.png") });
    await dialog.getByRole("button", { name: t("Elegir sustituto"), exact: true }).click();
    const picker = page.getByRole("dialog", { name: t("Elegir sustituto"), exact: true });
    await picker.getByRole("searchbox", { name: t("Buscar medios"), exact: true }).fill(f.run);
    const candidate = picker.getByRole("button", { name: t("Seleccionar {title}", { title: f.run + " replacement" }), exact: true });
    await expect(candidate).toBeVisible();
    for (const key of ["original", "wrongType", "unpublished"]) {
      await expect(picker.getByRole("button", { name: t("Seleccionar {title}", { title: f.run + " " + key }), exact: true })).toHaveCount(0);
    }
    await candidate.focus(); await page.keyboard.press("Enter");
    await picker.getByRole("button", { name: t("Usar como sustituto"), exact: true }).click();
    await expect(picker).not.toBeVisible();
    await page.locator('[data-slot="dialog-content"][data-closed]').waitFor({ state: "detached" });
    const confirm = dialog.getByRole("button", { name: t("Eliminar y reemplazar"), exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog.getByRole("alert")).toContainText(t("El servidor mantiene bloqueada la eliminación. No se aplicaron cambios. Despublica o archiva con el sustituto para conservar el historial."));
    await expect(confirm).toBeDisabled();
    expect(db("state", fixturePath)).toEqual(before);
    await page.screenshot({ path: path.join(evidence, "123-delete-409.png") });
    await dialog.getByRole("button", { name: t("Despublicar"), exact: true }).click();
    const unpublish = page.getByRole("dialog", { name: `${t("Despublicar")} «${f.run} original»`, exact: true });
    await unpublish.getByRole("button", { name: t("Despublicar y reemplazar"), exact: true }).click();
    const done = page.getByRole("dialog", { name: t("Cambios guardados"), exact: true });
    await expect(done).toContainText(t("Impacto confirmado: {patients} pacientes y {templates} plantillas.", { patients: "2", templates: "1" }));
    const after: State = db("state", fixturePath);
    expect(after.media.find(m => m[0] === f.original)?.[1]).toBe("Draft");
    expect(after.media.find(m => m[0] === f.replacement)?.[1]).toBe("Published");
    expect(after.template).toEqual(before.template);
    for (const row of after.references) expect(row[3]).toBe(row[0] === f.template ? f.replacement : f.original);
    for (const week of after.weeks) {
      const old = before.weeks.find(w => w[0] === week[0] && w[1] === week[1])!;
      if (week[1] === 1) expect(week).toEqual(old);
      else for (const item of week[3]) {
        expect(item.media_id).toBe(item.origin === "individual" ? f.original : f.replacement);
        expect({ ...item, media_id: f.original }).toEqual(old[3].find(r => r.weekday === item.weekday));
      }
    }
    const refs = await page.request.get(route + "/references", { headers });
    expect(refs.status()).toBe(200);
    const references = await refs.json();
    expect(references.templateReferences.every((r: { templateId: string }) => r.templateId === f.draft)).toBe(true);
    expect(http.traffic.filter(r => r.method === "DELETE" && r.path === route).map(r => r.status)).toEqual([409]);
    expect(http.traffic.filter(r => r.method === "POST" && r.path === route + "/unpublish").map(r => r.status)).toEqual([200]);
    expect(http.errors).toEqual([]);
    await page.screenshot({ path: path.join(evidence, "123-retired.png") });
    save("123-after.json", after);
    save("123-result.json", { passed: true, impact, initialDelete: 409, invalidReplacements: [422, 422, 422],
      deleteWithReplacement: 409, deleteAtomic: true, unpublish: 200, activeTemplateReplaced: true,
      futureProgramReplaced: true, individualPreserved: true, startedWeeksPreserved: true, draftPreserved: true,
      picker: "Solo Podcast Published distinto del original; destino programa", targets: [3000, 5080, 5122], mocks: 0, pageErrors: http.errors });
  } finally { if (qa) await cleanup(page.request, qa); }
});
