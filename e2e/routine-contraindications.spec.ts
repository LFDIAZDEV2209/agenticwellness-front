import { expect, test } from "@playwright/test";
import { mockExerciseDemo } from "./fixtures/exercise-demo-http";

const contraindications =
  "Contraindicación sintética QA: revisar las indicaciones registradas.";

test("2.20c · editar conserva las contraindicaciones y enviarlas vacías las elimina", async ({
  page,
}) => {
  const http = await mockExerciseDemo(page);
  http.routine.contraindications = contraindications;
  await page.goto("/wellness/exercise-routines");
  await page.getByTitle("Editar", { exact: true }).click();
  const field = page.getByLabel("Contraindicaciones", { exact: true });
  await expect(field).toHaveValue(contraindications);
  await expect(field).toHaveAttribute("maxlength", "4000");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
  await expect.poll(() => http.state.saves.length).toBe(1);
  expect(http.state.saves[0]).toMatchObject({
    contraindications,
    exercises: [{ mediaId: http.file.id }],
  });
  await page.getByTitle("Editar", { exact: true }).click();
  await field.fill("");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
  await expect.poll(() => http.state.saves.length).toBe(2);
  expect(http.state.saves[1].contraindications).toBe("");
});

test("2.20c · duplicar usa clone una vez, abre borrador y conserva ejercicios y demostración", async ({
  page,
}) => {
  const http = await mockExerciseDemo(page);
  http.routine.contraindications = contraindications;
  const copy = structuredClone(http.routine);
  copy.id = "00000000-0000-4000-8000-000000000899";
  copy.name = "Copia de Rutina QA";
  copy.status = "Draft";
  copy.exercises[0].id = "copy-exercise";
  const calls: unknown[] = [];
  let hold = true;
  await page.route(
    `**/api/v1/wellness/exercise-routines/${http.routine.id}/clone`,
    async (route) => {
      calls.push(route.request().postDataJSON());
      while (hold) await new Promise((resolve) => setTimeout(resolve, 20));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(copy),
      });
    },
  );
  await page.route(
    `**/api/v1/wellness/exercise-routines/${copy.id}`,
    (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(copy),
          })
        : route.fallback(),
  );
  await page.goto("/wellness/exercise-routines");
  try {
    await page.getByTitle("Duplicar", { exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => calls.length).toBe(1);
    await expect(page.getByTitle("Duplicar", { exact: true })).toBeDisabled();
  } finally {
    hold = false;
  }
  await expect(page.locator("#routine-name")).toHaveValue(copy.name);
  await expect(
    page.getByLabel("Contraindicaciones", { exact: true }),
  ).toHaveValue(contraindications);
  await expect(page.getByLabel("Nombre del ejercicio *")).toHaveValue(
    "Movimiento QA",
  );
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
  await expect.poll(() => http.state.saves.length).toBe(1);
  expect(http.state.saves[0]).toMatchObject({
    status: "Draft",
    contraindications,
    exercises: [{ mediaId: http.file.id, name: "Movimiento QA" }],
  });
  expect(calls).toEqual([{}]);
  expect(http.routine.status).toBe("Active");
});

test("2.20c · clone rechazado muestra error sin abrir copia ni reintentar solo", async ({
  page,
}) => {
  const http = await mockExerciseDemo(page);
  let calls = 0;
  await page.route(
    `**/api/v1/wellness/exercise-routines/${http.routine.id}/clone`,
    (route) => {
      calls++;
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Sin alcance" }),
      });
    },
  );
  await page.goto("/wellness/exercise-routines");
  await page.getByTitle("Duplicar", { exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "No se pudo duplicar la rutina" }),
  ).toContainText("No se pudo duplicar la rutina");
  await expect(page.locator("#routine-name")).toHaveCount(0);
  expect(calls).toBe(1);
  expect(http.state.saves).toHaveLength(0);
  await page.getByTitle("Ver detalles", { exact: true }).click();
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "No se pudo duplicar la rutina",
  );
  expect(calls).toBe(2);
});

test("2.20c · aviso de contraindicaciones antes de asignar, sin inferir diagnósticos", async ({
  page,
}, info) => {
  const http = await mockExerciseDemo(page);
  http.routine.contraindications = contraindications;
  await page.goto(`/wellness/assignments/new?routineId=${http.routine.id}`);
  const note = page.getByRole("note", {
    name: "Contraindicaciones",
    exact: true,
  });
  await expect(note).toContainText(contraindications);
  await expect(note).toContainText(
    "Revisa estas indicaciones antes de asignar la rutina.",
  );
  expect(http.state.saves).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await note.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("routine-assignment-warning.png"),
    fullPage: true,
  });
});

test("2.20c · lectura oculta duplicar en lista y detalle", async ({ page }) => {
  const http = await mockExerciseDemo(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "qa",
        firstName: "QA",
        lastName: "Lectura",
        email: "qa@example.invalid",
        roles: ["QA"],
        permissions: ["Wellness.View", "Media.View"],
      }),
    }),
  );
  await page.goto("/wellness/exercise-routines");
  await expect(page.getByTitle("Duplicar", { exact: true })).toHaveCount(0);
  await page.getByTitle("Ver detalles", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Duplicar", exact: true }),
  ).toHaveCount(0);
  expect(http.state.saves).toHaveLength(0);
});
