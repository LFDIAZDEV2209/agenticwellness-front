import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readQaPassword as password } from "./helpers/nutrition-real-credentials.mjs";

interface Account {
  login: string;
  documentNumber?: string;
  credentialTarget: string;
}
interface Fixture {
  patientId: string;
  cycleId: string;
  sourcePrescriptionId: string;
  nextPrescriptionId: string;
  localDate: string;
  accounts: Record<"patient" | "nutritionist" | "coordinator" | "foreignNutritionist", Account>;
}
interface Recommendation {
  cycleNumber: number;
  publishedAt: string;
  professionalName: string;
  patientMessage: string;
  attachments: { url: string; caption: string | null }[];
}
interface Recommendations {
  current: Recommendation | null;
  previous: Recommendation[];
}

function localOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/")
    throw new Error("3.20 solo admite orígenes HTTP locales de QA.");
  return url.origin;
}
const erp = localOrigin(process.env.E2E_BASE_URL ?? "http://localhost:3056");
const app = localOrigin(process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5182");
const metadataPath = process.env.E2E_320_FIXTURE;

const route = (url: string) => new URL(url).pathname;
const at = (path: string) => (response: { url(): string }) => route(response.url()) === path;

async function erpLogin(page: Page, account: Account) {
  await page.goto(erp + "/login");
  await page.locator("#email").fill(account.login);
  await page.locator("#password").fill(password(account.credentialTarget));
  const slider = page.getByRole("slider", { name: "Comencemos", exact: true });
  await slider.focus();
  await slider.press("End");
  await expect(page).toHaveURL(/\/dashboard/);
}
async function appLogin(page: Page, account: Account) {
  await page.goto(app);
  await page.locator("#login-id input").fill(account.documentNumber ?? account.login);
  await page.locator("#login-password input").fill(password(account.credentialTarget));
  await page.getByRole("button", { name: "Comencemos", exact: true }).click();
  await expect(page.locator("#login-id")).toHaveCount(0);
}
async function imageDecoded(page: Page) {
  const images = page.getByTestId("nutrition-recommendation-image");
  await expect(images.first()).toBeVisible();
  await expect.poll(() => images.first().evaluate(host => {
    const image = host.shadowRoot?.querySelector("img");
    return !!image?.complete && image.naturalWidth > 0;
  })).toBe(true);
}

test("3.20 preflight · identidades, permisos y alcance contra APIs reales", async ({ browser }, info) => {
  if (!metadataPath) throw new Error("Define E2E_320_FIXTURE con metadata QA, sin contraseñas.");
  const fixture = JSON.parse(readFileSync(metadataPath, "utf8")) as Fixture;
  const evidence: { role: string; status: number; photosAllowed?: boolean }[] = [];
  for (const role of ["patient", "nutritionist", "coordinator", "foreignNutritionist"] as const) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const origin = role === "patient" ? app : erp;
      const account = fixture.accounts[role];
      const authentication = await context.request.post(origin + "/api/auth/login", { data: {
        email: account.login, password: password(account.credentialTarget),
        application: role === "patient" ? "app" : "erp", rememberMe: false,
      } });
      expect(authentication.status(), `${role}: login real`).toBe(200);
      const token = (await authentication.json()).accessToken;
      const headers = { Authorization: `Bearer ${token}` };
      const me = await context.request.get(origin + "/api/auth/me", { headers });
      expect(me.status()).toBe(200);
      const permissions = (await me.json()).permissions as string[];
      const path = role === "patient" ? "/api/v1/me/nutrition/cycles/recommendations"
        : `/api/v1/nutrition/patients/${fixture.patientId}/workspace`;
      const response = await context.request.get(origin + path, { headers });
      expect(response.status(), `${role}: alcance real`).toBe(role === "foreignNutritionist" ? 404 : 200);
      if (role === "patient") expect((await response.json()).current).not.toBeNull();
      else {
        expect(permissions).toContain("Nutrition.RecordsView");
        expect(permissions.includes("Nutrition.PhotosView")).toBe(role !== "coordinator");
      }
      evidence.push({ role, status: response.status(), photosAllowed: permissions.includes("Nutrition.PhotosView") });
    } finally { await context.close(); }
  }
  writeFileSync(info.outputPath("preflight.json"), JSON.stringify({ apiInterception: false, identities: evidence }, null, 2));
});

test("3.20 · Foto IA corregida → ERP con alcance real → publicación conjunta → APP bilingüe", async ({ browser }, info) => {
  if (!metadataPath) throw new Error("Define E2E_320_FIXTURE con metadata QA, sin contraseñas.");
  const fixture = JSON.parse(readFileSync(metadataPath, "utf8")) as Fixture;
  for (const id of [fixture.patientId, fixture.cycleId, fixture.sourcePrescriptionId, fixture.nextPrescriptionId])
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
  // Reanudar solo una ejecución que ya guardó la comida; nunca duplicarla.
  const resume = process.env.E2E_320_RESUME
    ? JSON.parse(readFileSync(process.env.E2E_320_RESUME, "utf8")) as {
      complete: boolean; fixture: { patientId: string; cycleId: string };
      analysis: { provider: string; analysisId: string }; stages: string[];
    } : null;
  if (resume) {
    expect(resume.complete).toBe(false);
    expect(resume.fixture).toEqual({ patientId: fixture.patientId, cycleId: fixture.cycleId });
    expect(resume.stages).toEqual(["APP: análisis real y registro corregido con referencia al análisis"]);
    expect(resume.analysis.analysisId).toMatch(/^[a-f0-9-]{36}$/i);
  }
  const contexts: BrowserContext[] = [];
  const events: { actor: string; method: string; path: string; status: number }[] = [];
  const errors: { actor: string; message: string }[] = [];
  const consoleCounts: Record<string, { warnings: number; errors: number }> = {};
  const stages: string[] = [...(resume?.stages ?? [])];
  let complete = false;
  let analysisEvidence: { provider: string; analysisId: string } | null = resume?.analysis ?? null;
  const identities: Record<string, { token: string; permissions: string[] }> = {};
  async function actor(name: keyof Fixture["accounts"], origin: string) {
    const context = await browser.newContext({ serviceWorkers: "block", locale: "es-CO", timezoneId: "America/Bogota", viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const page = await context.newPage();
    consoleCounts[name] = { warnings: 0, errors: 0 };
    page.on("console", message => {
      if (message.type() === "warning") consoleCounts[name].warnings++;
      if (message.type() === "error") consoleCounts[name].errors++;
    });
    page.on("pageerror", error => errors.push({ actor: name, message: error.name }));
    page.on("response", async response => {
      const path = route(response.url());
      if (path.startsWith("/api/")) events.push({ actor: name, method: response.request().method(), path, status: response.status() });
      if (path === "/api/auth/login" && response.status() === 200) {
        const body = await response.json();
        identities[name] = { token: body.accessToken, permissions: [] };
      }
    });
    if (origin === app) await appLogin(page, fixture.accounts[name]);
    else await erpLogin(page, fixture.accounts[name]);
    await expect.poll(() => !!identities[name]?.token).toBe(true);
    const me = await context.request.get(origin + "/api/auth/me", { headers: { Authorization: `Bearer ${identities[name].token}` } });
    expect(me.status()).toBe(200);
    identities[name].permissions = (await me.json()).permissions;
    const jwt = JSON.parse(Buffer.from(identities[name].token.split(".")[1], "base64url").toString());
    expect([jwt.aud].flat()).toContain(origin === app ? "app" : "erp");
    return { context, page, headers: { Authorization: `Bearer ${identities[name].token}` } };
  }
  try {
    const patient = await actor("patient", app);
    const recommendationsPath = "/api/v1/me/nutrition/cycles/recommendations";
    const initialRead = patient.page.waitForResponse(at(recommendationsPath));
    await patient.page.getByRole("button", { name: "Nutrición", exact: true }).click();
    expect((await initialRead).status()).toBe(200);
    const before = await (await patient.context.request.get(app + recommendationsPath, { headers: patient.headers })).json() as Recommendations;
    expect(before.current, "La fixture debe conservar la publicación histórica preparada").not.toBeNull();
    const jpeg = process.env.E2E_320_IMAGE ?? resolve(__dirname, "../../../food-ai-service/tests/assets/pizza.jpg");
    let analysis = resume?.analysis;
    if (!resume) {
      const meal = patient.page.locator("article").filter({ has: patient.page.locator(".meal-title", { hasText: /^Almuerzo$/ }) });
      await meal.getByRole("button", { name: "Foto IA", exact: true }).click();
      await patient.page.locator("input[data-gallery-input]").setInputFiles(jpeg);
      const analysisResponse = patient.page.waitForResponse(at("/api/v1/foodai/analyze"), { timeout: 120_000 });
      await patient.page.getByRole("button", { name: "Usar foto y analizar", exact: true }).click();
      const analyzed = await analysisResponse;
      expect(analyzed.status(), "El análisis debe ejecutarse contra el proveedor real").toBe(200);
      const analyzedBody = await analyzed.json();
      analysis = { provider: analyzedBody.provider, analysisId: analyzedBody.analysisId };
      expect(analyzedBody.foods.length).toBeGreaterThan(0);
      expect(analyzedBody.analysisId).toBeTruthy();
      await patient.page.getByRole("button", { name: "Editar valores", exact: true }).click();
      await patient.page.locator(".meal-intake-calories input").fill("623");
      await patient.page.locator(".meal-intake-proteinG input").fill("31");
      const saved = patient.page.waitForResponse(response => at("/api/v1/program/nutrition/log")(response) && response.request().method() === "POST");
      await patient.page.getByRole("button", { name: "Guardar Almuerzo", exact: true }).click();
      const intakeResponse = await saved;
      expect(intakeResponse.status()).toBe(200);
      const intakeRequest = intakeResponse.request().postDataJSON();
      expect(intakeRequest.intake.foodAnalysisId).toBe(analysis.analysisId);
      expect(intakeRequest.intake.calories).toBe(623);
      expect(intakeRequest.clientRequestId).toBeTruthy();
      stages.push("APP: análisis real y registro corregido con referencia al análisis");
      await patient.page.screenshot({ path: info.outputPath("app-corrected-intake.png"), fullPage: true });
    }
    if (!analysis) throw new Error("Falta el análisis real del registro QA.");
    analysisEvidence = { provider: analysis.provider, analysisId: analysis.analysisId };

    const professional = await actor("nutritionist", erp);
    expect(identities.nutritionist.permissions).toEqual(expect.arrayContaining(["Nutrition.Approve", "Nutrition.PhotosView", "Nutrition.RecordsView"]));
    const intakePath = `/api/v1/nutrition/patients/${fixture.patientId}/intake`;
    // El almuerzo de hoy está en continuidad, no en la primera respuesta del ciclo cerrado.
    const intakeRead = professional.page.waitForResponse(response => at(intakePath)(response)
      && new URL(response.url()).searchParams.get("from") === fixture.localDate);
    await professional.page.goto(`${erp}/nutrition/${fixture.patientId}?prescriptionId=${fixture.sourcePrescriptionId}&tab=registros`);
    const intakePage = await (await intakeRead).json();
    const record = intakePage.days.flatMap((day: { records: { id: string; analysis: { analysisId: string } | null; recorded: { calories: number }; patientCorrection: boolean; photo: { url: string } | null }[] }) => day.records)
      .find((row: { analysis: { analysisId: string } | null }) => row.analysis?.analysisId === analysis.analysisId);
    expect(record).toBeTruthy();
    expect(record.recorded.calories).toBe(623);
    expect(record.recorded.proteinG).toBe(31);
    expect(record.patientCorrection).toBe(true);
    expect(record.photo).not.toBeNull();
    await professional.page.locator(".nutrition-intake-meals").getByRole("button", { name: /^Almuerzo/ }).click();
    await expect(professional.page.getByRole("complementary", { name: "Detalle de la comida", exact: true })).toContainText("623 kcal");
    const foodImage = professional.page.getByRole("img", { name: "Foto de la comida registrada", exact: true });
    await expect(foodImage).toBeVisible();
    await expect.poll(() => foodImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await professional.page.screenshot({ path: info.outputPath("erp-corrected-photo.png"), fullPage: true });
    stages.push("ERP: foto firmada decodificada, estimación y corrección persistida");

    const coordinator = await actor("coordinator", erp);
    expect(identities.coordinator.permissions).toContain("Nutrition.RecordsView");
    expect(identities.coordinator.permissions).not.toContain("Nutrition.PhotosView");
    const qs = new URLSearchParams({ from: fixture.localDate, to: fixture.localDate, page: "1", pageSize: "100" });
    const coordinated = await coordinator.context.request.get(`${erp}${intakePath}?${qs}`, { headers: coordinator.headers });
    expect(coordinated.status()).toBe(200);
    const coordinatedBody = await coordinated.json();
    const coordinatedRecords = coordinatedBody.days.flatMap((day: { records: { id: string; photo: unknown }[] }) => day.records);
    expect(coordinatedRecords.find((row: { id: string }) => row.id === record.id), "Coordinación debe leer la misma comida").toBeTruthy();
    expect(coordinatedRecords.every((row: { photo: unknown }) => row.photo === null)).toBe(true);
    await coordinator.page.goto(`${erp}/nutrition/${fixture.patientId}?prescriptionId=${fixture.sourcePrescriptionId}&tab=registros`);
    await expect(coordinator.page.getByRole("button", { name: "Ampliar foto de la comida", exact: true })).toHaveCount(0);
    const foreign = await actor("foreignNutritionist", erp);
    expect(identities.foreignNutritionist.permissions).toContain("Nutrition.RecordsView");
    const denied = await foreign.context.request.get(`${erp}${intakePath}?${qs}`, { headers: foreign.headers });
    expect(denied.status()).toBe(404);
    stages.push("Alcance: coordinación conserva registros sin fotos; nutricionista ajeno recibe 404");

    await professional.page.getByRole("button", { name: "Iniciar revisión del ciclo", exact: true }).click();
    const note = "QA 3.20 NOTA INTERNA: no publicar";
    const messageEs = "QA 3.20: mantén el plan revisado y las porciones acordadas.";
    const messageEn = "QA 3.20: follow the reviewed plan and agreed portions.";
    await professional.page.getByRole("textbox", { name: "Evaluación interna (obligatoria para publicar)", exact: true }).fill(note);
    await professional.page.getByRole("textbox", { name: "Mensaje a la persona · Español", exact: true }).fill(messageEs);
    await professional.page.getByRole("textbox", { name: "Mensaje a la persona · English", exact: true }).fill(messageEn);
    const save = professional.page.getByRole("button", { name: "Guardar y retomar luego", exact: true });
    await save.click();
    await expect(professional.page.getByText("Cierre guardado. Puedes retomarlo más tarde.", { exact: true })).toBeVisible();
    await professional.page.getByRole("combobox", { name: "Borrador del siguiente ciclo", exact: true }).selectOption(fixture.nextPrescriptionId);
    const editor = professional.page.getByRole("dialog", { name: "Preparar el siguiente plan", exact: true });
    const submit = editor.getByRole("button", { name: "Enviar plan a aprobación", exact: true });
    if (await submit.count()) await submit.click();
    await editor.getByRole("button", { name: "Usar este plan en el cierre", exact: true }).click();
    await professional.page.getByRole("checkbox", { name: "Revisé personalmente las alertas y la validación del plan siguiente.", exact: true }).check();
    await save.click();
    const privateCaption = "QA 3.20: adjunto interno que no debe llegar a APP";
    await professional.page.getByLabel("Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB", { exact: true }).setInputFiles(jpeg);
    await professional.page.getByLabel("Pie del adjunto (opcional)", { exact: true }).fill(privateCaption);
    const privateUpload = professional.page.waitForResponse(at(`/api/v1/nutrition/cycles/${fixture.cycleId}/review/attachments`));
    await professional.page.getByRole("button", { name: "Guardar adjunto", exact: true }).click();
    expect((await privateUpload).status()).toBe(200);
    await expect(professional.page.locator(".nutrition-closing-preview img")).toHaveCount(0);
    await professional.page.getByLabel("Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB", { exact: true }).setInputFiles(jpeg);
    await professional.page.getByLabel("Pie del adjunto (opcional)", { exact: true }).fill("QA 3.20: ejemplo visible revisado");
    await professional.page.getByRole("checkbox", { name: "Mostrar esta imagen y su pie a la persona al publicar", exact: true }).check();
    await professional.page.getByRole("button", { name: "Guardar adjunto", exact: true }).click();
    await expect(professional.page.locator(".nutrition-closing-preview img")).toBeVisible();
    const publication = professional.page.waitForResponse(at(`/api/v1/nutrition/cycles/${fixture.cycleId}/publish`));
    await professional.page.getByRole("button", { name: "Publicar plan y mensaje", exact: true }).click();
    await professional.page.getByRole("button", { name: "Confirmar publicación conjunta", exact: true }).click();
    expect((await publication).status()).toBe(200);
    await expect(professional.page.getByText("Plan y mensaje publicados", { exact: true })).toBeVisible();
    stages.push("ERP: plan siguiente y texto bilingüe con imagen publicados en una operación real");

    await patient.page.reload();
    await patient.page.getByRole("button", { name: "Nutrición", exact: true }).click();
    await patient.page.getByTestId("nutrition-tab-plan").click();
    await expect(patient.page.getByTestId("nutrition-recommendations")).toHaveAttribute("data-state", "ready");
    await expect(patient.page.getByTestId("nutrition-recommendation-message")).toHaveText(messageEs);
    await expect(patient.page.getByTestId("nutrition-recommendations")).not.toContainText(note);
    await imageDecoded(patient.page);
    for (const width of [320, 390, 1440]) {
      await patient.page.setViewportSize({ width, height: 1000 });
      await expect(patient.page.getByTestId("nutrition-recommendation-caption")).toHaveText("QA 3.20: ejemplo visible revisado");
      expect(await patient.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await patient.page.screenshot({ path: info.outputPath(`app-published-es-${width}.png`), fullPage: true });
      await patient.page.getByTestId("nutrition-history-open").click();
      await expect(patient.page.getByTestId("nutrition-history")).toHaveAttribute("data-state", "ready");
      await expect(patient.page.getByTestId("nutrition-history-cycle").first().getByTestId("nutrition-recommendation-message")).toHaveText(before.current!.patientMessage);
      expect(await patient.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await patient.page.screenshot({ path: info.outputPath(`app-history-es-${width}.png`), fullPage: true });
      await patient.page.getByTestId("nutrition-history-back").click();
    }
    const afterResponse = await patient.context.request.get(app + recommendationsPath, { headers: patient.headers });
    expect(afterResponse.status()).toBe(200);
    const after = await afterResponse.json() as Recommendations;
    expect(after.current?.patientMessage).toBe(messageEs);
    expect(after.current?.attachments).toHaveLength(1);
    expect(after.current?.professionalName).toBeTruthy();
    expect(Object.keys(after.current!).sort()).toEqual(["attachments", "cycleNumber", "endDate", "patientMessage", "professionalName", "publishedAt", "startDate"]);
    expect(after.previous.length).toBeGreaterThanOrEqual(1);
    expect(after.previous[0].publishedAt).toBe(before.current!.publishedAt);
    const mobileWire = JSON.stringify(after);
    for (const hidden of ["professionalNotes", "aiDraft", "summary", "visibleToPatient", note, privateCaption]) expect(mobileWire).not.toContain(hidden);
    await patient.page.getByTestId("nutrition-history-open").click();
    await expect(patient.page.getByTestId("nutrition-history")).toHaveAttribute("data-state", "ready");
    await expect(patient.page.getByTestId("nutrition-history-cycle")).toHaveCount(after.previous.length);
    await expect(patient.page.getByTestId("nutrition-history-cycle").first().getByTestId("nutrition-recommendation-message")).toHaveText(before.current!.patientMessage);
    await patient.page.getByTestId("nutrition-history-back").click();
    await patient.page.locator("nav.bnav").getByRole("button", { name: "Inicio", exact: true }).click();
    await patient.page.getByRole("button", { name: "Cambiar idioma a English", exact: true }).click();
    const englishRead = patient.page.waitForResponse(response => at(recommendationsPath)(response) && response.request().headers()["x-app-language"] === "en");
    await patient.page.locator("nav.bnav").getByRole("button", { name: "Nutrition", exact: true }).click();
    const englishResponse = await englishRead;
    expect(englishResponse.status()).toBe(200);
    expect(englishResponse.request().headers()["accept-language"]).toContain("en");
    const englishRecommendations = await englishResponse.json() as Recommendations;
    expect(englishRecommendations.current?.patientMessage).toBe(messageEn);
    await patient.page.getByTestId("nutrition-tab-plan").click();
    await expect(patient.page.getByTestId("nutrition-recommendation-message")).toHaveText(messageEn);
    await imageDecoded(patient.page);
    for (const width of [320, 390, 1440]) {
      await patient.page.setViewportSize({ width, height: 1000 });
      expect(await patient.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await patient.page.screenshot({ path: info.outputPath(`app-published-en-${width}.png`), fullPage: true });
      await patient.page.getByTestId("nutrition-history-open").click();
      await expect(patient.page.getByTestId("nutrition-history-cycle").first().getByTestId("nutrition-recommendation-message")).toHaveText(englishRecommendations.previous[0].patientMessage);
      expect(await patient.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await patient.page.screenshot({ path: info.outputPath(`app-history-en-${width}.png`), fullPage: true });
      await patient.page.getByTestId("nutrition-history-back").click();
    }
    stages.push("APP: lectura propia nueva, mensaje e imagen decodificada y ausencia de campos internos");
    expect(errors).toEqual([]);
    complete = true;
  } finally {
    writeFileSync(info.outputPath("evidence.json"), JSON.stringify({ complete, fixture: { patientId: fixture.patientId, cycleId: fixture.cycleId }, stages, analysis: analysisEvidence, events, pageErrors: errors, consoleCounts, apiInterception: false }, null, 2));
    for (const context of contexts) await context.close();
  }
});
